import { getPlatformRuntimeContext } from "../../runtime/context.js";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CommandMessage, DeviceRegistry, IntentPayload } from "@embodied-agent/core";
import { preloadDomainPacks } from "../../domain-packs/loader.js";
import { allocateAgentDataDir, releaseAgentDataDir } from "../../test/isolated-data-dir.js";
import { seedCanonicalSimRegistry } from "../../test/registry-fixture.js";
import { loadRegistry, saveRegistry } from "@embodied-agent/node";
import { MqttCommandPublisher } from "@embodied-agent/node";
import { intentToCommand } from "./intent-to-command.js";
import { publishPhysicalCommand } from "./publish-physical-command.js";
import type { RouteContext } from "../route-context.js";
import type { SceneResolvedDeviceTarget } from "@embodied-agent/runtime";
import { listCommands, clearCommands } from "../../commands/store.js";
import { listOperationLogs } from "../../db/log.js";
import { recordNodeAppliedConfigVersion } from "@embodied-agent/node";
import { issueNodeToken } from "@embodied-agent/node";
import { saveSettings } from "../../settings/store.js";
import { ingestHeartbeatMessage } from "../../telemetry/store.js";

let testDir: string;
let m20Server: Server | undefined;
let m20BaseUrl: string | undefined;
const ROBOT_DEPLOYMENT_ID = "dep-robot-pilot-001";

type RecordedM20Request = {
  method: string;
  path: string;
  body: unknown;
};

const m20Requests: RecordedM20Request[] = [];

class RecordingMqttPublisher extends MqttCommandPublisher {
  published: CommandMessage[] = [];

  constructor() {
    super("mqtt://127.0.0.1:1883");
  }

  override async connect(): Promise<void> {}

  override async publishCommand(cmd: CommandMessage): Promise<void> {
    this.published.push(cmd);
  }

  override async publishNodeConfig(): Promise<void> {}
}

function ventTarget(): SceneResolvedDeviceTarget {
  const device = loadRegistry().devices.find((d) => d.device_id === "vent-sim-gh-001");
  if (!device) throw new Error("vent-sim-gh-001 missing from registry fixture");
  return {
    deployment_id: "dep-gh-pilot-001",
    node_id: "node-sim-gh-001",
    config_version: 1,
    device,
  };
}

function robotRegistry(): DeviceRegistry {
  return {
    deployments: [
      {
        deployment_id: ROBOT_DEPLOYMENT_ID,
        name: "M20 试点",
        timezone: "Asia/Shanghai",
        status: "active",
      },
    ],
    entities: [],
    nodes: [
      {
        node_id: "m20-001",
        deployment_id: ROBOT_DEPLOYMENT_ID,
        name: "M20 机器狗",
        status: "active",
      },
    ],
    devices: [
      {
        device_id: "m20-001",
        deployment_id: ROBOT_DEPLOYMENT_ID,
        device_type: "robot_dog",
        name: "M20 机器狗",
        aliases: ["机器狗"],
        node_id: "m20-001",
        status: "active",
        default_for: "robot_dog",
      },
    ],
  };
}

function robotTarget(): SceneResolvedDeviceTarget {
  const device = loadRegistry().devices.find((d) => d.device_id === "m20-001");
  if (!device) throw new Error("m20-001 missing from registry fixture");
  return {
    deployment_id: ROBOT_DEPLOYMENT_ID,
    node_id: "m20-001",
    transport: "m20_http",
    device,
  };
}

function readRequestBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve(undefined);
        return;
      }
      resolve(JSON.parse(raw));
    });
  });
}

async function startM20Stub(): Promise<string> {
  m20Requests.length = 0;
  m20Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const body = await readRequestBody(req);
    m20Requests.push({
      method: req.method ?? "GET",
      path: req.url ?? "/",
      body,
    });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ code: 0, success: true, data: { ok: true } }));
  });
  await new Promise<void>((resolve, reject) => {
    m20Server?.once("error", reject);
    m20Server?.listen(0, "127.0.0.1", resolve);
  });
  const address = m20Server.address();
  if (!address || typeof address === "string") throw new Error("M20 stub listen failed");
  return `http://127.0.0.1:${address.port}`;
}

async function stopM20Stub(): Promise<void> {
  const server = m20Server;
  m20Server = undefined;
  m20BaseUrl = undefined;
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe("publishPhysicalCommand", () => {
  beforeAll(async () => {
    await preloadDomainPacks(getPlatformRuntimeContext().loader, { packIds: ["robotics"] });
  });

  beforeEach(() => {
    testDir = allocateAgentDataDir("publish-physical");
    seedCanonicalSimRegistry();
    clearCommands();
    recordNodeAppliedConfigVersion("dep-gh-pilot-001", "node-sim-gh-001", 1, "config_applied");
    issueNodeToken("dep-gh-pilot-001", "node-sim-gh-001");
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001", config_version: 1 });
  });

  afterEach(async () => {
    await stopM20Stub();
    delete process.env.DEPLOYMENT_ID;
    delete process.env.ACTIVE_DOMAIN;
    releaseAgentDataDir(testDir);
  });

  it("returns 503 when mqtt is unavailable", async () => {
    const intent: IntentPayload = {
      skill: "greenhouse.open_vent",
      target: { greenhouse_id: "gh-001" },
      parameters: { duration_seconds: 120 },
    };
    const ctx: RouteContext = {
      user_id: "u-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-physical-001",
      mqtt: undefined,
    };
    const target = ventTarget();
    const cmd = intentToCommand(intent, ctx, target);
    if (!cmd) throw new Error("intentToCommand returned null");
    const result = await publishPhysicalCommand({
      intent,
      ctx,
      target,
      safety: { allowed: true, requires_confirmation: false, reason: "ok" },
      cmd,
    });
    expect(result.status).toBe(503);
    expect(listCommands()).toHaveLength(1);
    expect(listCommands()[0]).toMatchObject({
      status: "failed",
      execution_transport: "mqtt",
      lifecycle_source: "scene_node_mqtt",
    });
    expect(listOperationLogs().at(-1)).toMatchObject({
      result: "failed",
      params: {
        execution_path: "mqtt_scene_node",
        event_source: "scene_node_mqtt",
      },
    });
  });

  it("publishes command when mqtt is available", async () => {
    const mqtt = new RecordingMqttPublisher();
    const intent: IntentPayload = {
      skill: "greenhouse.open_vent",
      target: { greenhouse_id: "gh-001" },
      parameters: { duration_seconds: 120 },
    };
    const ctx: RouteContext = {
      user_id: "u-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-physical-002",
      mqtt,
      skip_confirmation: true,
    };
    const target = ventTarget();
    const cmd = intentToCommand(intent, ctx, target);
    if (!cmd) throw new Error("intentToCommand returned null");
    const result = await publishPhysicalCommand({
      intent,
      ctx,
      target,
      safety: { allowed: true, requires_confirmation: false, reason: "ok" },
      cmd,
    });
    expect(result.status).toBe(200);
    expect(mqtt.published).toHaveLength(1);
    expect(mqtt.published[0]?.action).toBe("open");
    expect(listCommands().at(-1)).toMatchObject({
      status: "sent",
      execution_transport: "mqtt",
      lifecycle_source: "scene_node_mqtt",
    });
    expect(listOperationLogs().at(-1)).toMatchObject({
      result: "sent",
      params: {
        execution_path: "mqtt_scene_node",
        event_source: "scene_node_mqtt",
      },
    });
  });

  it("executes robot set_gait through the M20 HTTP transport", async () => {
    m20BaseUrl = await startM20Stub();
    saveRegistry(robotRegistry());
    ingestHeartbeatMessage({ node_id: "m20-001" }, ROBOT_DEPLOYMENT_ID);
    process.env.ACTIVE_DOMAIN = "robotics";
    saveSettings({
      deployment_id: ROBOT_DEPLOYMENT_ID,
      active_domain: "robotics",
      domain_configs: {
        robotics: {
          m20_base_url: m20BaseUrl,
          default_robot_id: "m20-001",
        },
      },
    });
    const intent: IntentPayload = {
      skill: "robot.set_gait",
      target: { robot_id: "m20-001" },
      parameters: { gait: "basic" },
    };
    const ctx: RouteContext = {
      user_id: "u-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-robot-gait",
      skip_confirmation: true,
    };

    const target = robotTarget();
    const cmd = intentToCommand(intent, ctx, target);
    if (!cmd) throw new Error("intentToCommand returned null");
    const result = await publishPhysicalCommand({
      intent,
      ctx,
      target,
      safety: { allowed: true, requires_confirmation: false, reason: "ok" },
      cmd,
    });

    expect(result.status).toBe(200);
    expect(m20Requests).toMatchObject([
      {
        method: "POST",
        path: "/body/gait",
        body: { GaitParam: 0x1001 },
      },
    ]);
    const command = listCommands(ROBOT_DEPLOYMENT_ID)[0];
    expect(command?.status).toBe("completed");
    expect(command?.sent_at).toBeDefined();
    expect(command?.last_event_at).toBeDefined();
    expect(command?.result).toEqual({ ok: true });
    expect(command?.execution_transport).toBe("m20_http");
    expect(command?.lifecycle_source).toBe("api_domain_executor");
    expect(command?.telemetry_flywheel?.after).toBeUndefined();
    expect(listOperationLogs().at(-1)).toMatchObject({
      result: "completed",
      params: {
        command_id: command?.command_id,
        device_id: "m20-001",
        action: "set_gait",
        transport: "m20_http",
        execution_path: "domain_physical_executor",
        event_source: "api_domain_executor",
      },
    });
  });

  it("executes robot play_audio through the M20 HTTP transport", async () => {
    m20BaseUrl = await startM20Stub();
    saveRegistry(robotRegistry());
    ingestHeartbeatMessage({ node_id: "m20-001" }, ROBOT_DEPLOYMENT_ID);
    process.env.ACTIVE_DOMAIN = "robotics";
    saveSettings({
      deployment_id: ROBOT_DEPLOYMENT_ID,
      active_domain: "robotics",
      domain_configs: {
        robotics: {
          m20_base_url: m20BaseUrl,
          default_robot_id: "m20-001",
        },
      },
    });
    const intent: IntentPayload = {
      skill: "robot.play_audio",
      target: { robot_id: "m20-001" },
      parameters: { file_name: "warning.mp3", loop: true },
    };
    const ctx: RouteContext = {
      user_id: "u-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-robot-audio",
      skip_confirmation: true,
    };

    const target = robotTarget();
    const cmd = intentToCommand(intent, ctx, target);
    if (!cmd) throw new Error("intentToCommand returned null");
    const result = await publishPhysicalCommand({
      intent,
      ctx,
      target,
      safety: { allowed: true, requires_confirmation: false, reason: "ok" },
      cmd,
    });

    expect(result.status).toBe(200);
    expect(m20Requests).toMatchObject([
      {
        method: "POST",
        path: "/speaker/play?fileName=warning.mp3&loop=true",
        body: undefined,
      },
    ]);
    expect(listCommands(ROBOT_DEPLOYMENT_ID)[0]?.status).toBe("completed");
  });

  it("marks robot direct executor failures with explicit audit source", async () => {
    saveRegistry(robotRegistry());
    ingestHeartbeatMessage({ node_id: "m20-001" }, ROBOT_DEPLOYMENT_ID);
    process.env.ACTIVE_DOMAIN = "robotics";
    saveSettings({
      deployment_id: ROBOT_DEPLOYMENT_ID,
      active_domain: "robotics",
      domain_configs: {
        robotics: {
          m20_base_url: "http://127.0.0.1:9",
          default_robot_id: "m20-001",
        },
      },
    });
    const intent: IntentPayload = {
      skill: "robot.set_gait",
      target: { robot_id: "m20-001" },
      parameters: { gait: "basic" },
    };
    const ctx: RouteContext = {
      user_id: "u-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-robot-gait-failed",
      skip_confirmation: true,
    };

    const target = robotTarget();
    const cmd = intentToCommand(intent, ctx, target);
    if (!cmd) throw new Error("intentToCommand returned null");
    const result = await publishPhysicalCommand({
      intent,
      ctx,
      target,
      safety: { allowed: true, requires_confirmation: false, reason: "ok" },
      cmd,
    });

    expect(result.status).toBe(503);
    const command = listCommands(ROBOT_DEPLOYMENT_ID).at(-1);
    expect(command?.status).toBe("failed");
    expect(command?.execution_transport).toBe("m20_http");
    expect(command?.lifecycle_source).toBe("api_domain_executor");
    expect(listOperationLogs().at(-1)).toMatchObject({
      result: "failed",
      params: {
        command_id: command?.command_id,
        device_id: "m20-001",
        execution_path: "domain_physical_executor",
        event_source: "api_domain_executor",
        transport: "m20_http",
      },
    });
  });

  it("executes robot gimbal_move through the M20 HTTP transport", async () => {
    m20BaseUrl = await startM20Stub();
    saveRegistry(robotRegistry());
    ingestHeartbeatMessage({ node_id: "m20-001" }, ROBOT_DEPLOYMENT_ID);
    process.env.ACTIVE_DOMAIN = "robotics";
    saveSettings({
      deployment_id: ROBOT_DEPLOYMENT_ID,
      active_domain: "robotics",
      domain_configs: {
        robotics: {
          m20_base_url: m20BaseUrl,
          default_robot_id: "m20-001",
        },
      },
    });
    const intent: IntentPayload = {
      skill: "robot.gimbal_move",
      target: { robot_id: "m20-001" },
      parameters: { direction: "left", duration_ms: 1500 },
    };
    const ctx: RouteContext = {
      user_id: "u-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-robot-gimbal",
      skip_confirmation: true,
    };

    const target = robotTarget();
    const cmd = intentToCommand(intent, ctx, target);
    if (!cmd) throw new Error("intentToCommand returned null");
    const result = await publishPhysicalCommand({
      intent,
      ctx,
      target,
      safety: { allowed: true, requires_confirmation: false, reason: "ok" },
      cmd,
    });

    expect(result.status).toBe(200);
    expect(m20Requests).toMatchObject([
      {
        method: "POST",
        path: "/gimbal/ptz/move?direction=left&durationMs=1500",
        body: undefined,
      },
    ]);
    expect(listCommands(ROBOT_DEPLOYMENT_ID)[0]?.status).toBe("completed");
  });

  it("rejects same-action in-flight with 409 + existing_command_id, no new createCommand", async () => {
    const mqtt = new RecordingMqttPublisher();
    const intent: IntentPayload = {
      skill: "greenhouse.open_vent",
      target: { greenhouse_id: "gh-001" },
      parameters: { duration_seconds: 120 },
    };
    const ctx: RouteContext = {
      user_id: "u-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-inflight-same",
      mqtt,
      skip_confirmation: true,
    };
    const target = ventTarget();
    const cmd = intentToCommand(intent, ctx, target);
    if (!cmd) throw new Error("intentToCommand returned null");
    const first = await publishPhysicalCommand({
      intent,
      ctx,
      target,
      safety: { allowed: true, requires_confirmation: false, reason: "ok" },
      cmd,
    });
    expect(first.status).toBe(200);

    const ctx2: RouteContext = {
      user_id: "u-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-inflight-same-2",
      mqtt,
      skip_confirmation: true,
    };
    const cmd2 = intentToCommand(intent, ctx2, target);
    if (!cmd2) throw new Error("intentToCommand returned null");
    const second = await publishPhysicalCommand({
      intent,
      ctx: ctx2,
      target,
      safety: { allowed: true, requires_confirmation: false, reason: "ok" },
      cmd: cmd2,
    });
    expect(second.status).toBe(409);
    expect(second.reply).toContain("相同指令");
    expect(second.params).toMatchObject({
      code: "device_command_in_flight",
      existing_command_id: cmd.command_id,
    });
    expect(listCommands()).toHaveLength(1);
    expect(listOperationLogs().at(-1)).toMatchObject({
      result: "rejected",
      params: { code: "device_command_in_flight" },
    });
  });

  it("rejects different-action in-flight with 409 + in_flight_action", async () => {
    const mqtt = new RecordingMqttPublisher();
    const openIntent: IntentPayload = {
      skill: "greenhouse.open_vent",
      target: { greenhouse_id: "gh-001" },
      parameters: { duration_seconds: 120 },
    };
    const ctxOpen: RouteContext = {
      user_id: "u-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-inflight-diff-1",
      mqtt,
      skip_confirmation: true,
    };
    const target = ventTarget();
    const cmdOpen = intentToCommand(openIntent, ctxOpen, target);
    if (!cmdOpen) throw new Error("intentToCommand returned null");
    await publishPhysicalCommand({
      intent: openIntent,
      ctx: ctxOpen,
      target,
      safety: { allowed: true, requires_confirmation: false, reason: "ok" },
      cmd: cmdOpen,
    });

    const closeIntent: IntentPayload = {
      skill: "greenhouse.close_vent",
      target: { greenhouse_id: "gh-001" },
      parameters: { duration_seconds: 120 },
    };
    const ctxClose: RouteContext = {
      user_id: "u-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-inflight-diff-2",
      mqtt,
      skip_confirmation: true,
    };
    const cmdClose = intentToCommand(closeIntent, ctxClose, target);
    if (!cmdClose) throw new Error("intentToCommand returned null");
    const second = await publishPhysicalCommand({
      intent: closeIntent,
      ctx: ctxClose,
      target,
      safety: { allowed: true, requires_confirmation: false, reason: "ok" },
      cmd: cmdClose,
    });
    expect(second.status).toBe(409);
    expect(second.reply).toContain("open");
    expect(second.params).toMatchObject({
      code: "device_command_in_flight",
      in_flight_action: "open",
    });
    expect(listCommands()).toHaveLength(1);
  });

  it("allows re-dispatch after previous command failed (flywheel-fail regression)", async () => {
    // 第一跳：mqtt 不可用 → failed (terminal)
    const intent: IntentPayload = {
      skill: "greenhouse.open_vent",
      target: { greenhouse_id: "gh-001" },
      parameters: { duration_seconds: 120 },
    };
    const ctxFail: RouteContext = {
      user_id: "u-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-inflight-fail-1",
      mqtt: undefined,
      skip_confirmation: true,
    };
    const target = ventTarget();
    const cmd1 = intentToCommand(intent, ctxFail, target);
    if (!cmd1) throw new Error("intentToCommand returned null");
    const first = await publishPhysicalCommand({
      intent,
      ctx: ctxFail,
      target,
      safety: { allowed: true, requires_confirmation: false, reason: "ok" },
      cmd: cmd1,
    });
    expect(first.status).toBe(503);
    expect(listCommands().at(-1)?.status).toBe("failed");

    // 第二跳：同 device 同 action，mqtt 可用 → 应正常下发（不被 in-flight 拒绝）
    const mqtt = new RecordingMqttPublisher();
    const ctx2: RouteContext = {
      user_id: "u-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-inflight-fail-2",
      mqtt,
      skip_confirmation: true,
    };
    const cmd2 = intentToCommand(intent, ctx2, target);
    if (!cmd2) throw new Error("intentToCommand returned null");
    const second = await publishPhysicalCommand({
      intent,
      ctx: ctx2,
      target,
      safety: { allowed: true, requires_confirmation: false, reason: "ok" },
      cmd: cmd2,
    });
    expect(second.status).toBe(200);
    expect(mqtt.published).toHaveLength(1);
    expect(listCommands()).toHaveLength(2);
  });

  it("serializes concurrent same-device dispatches via per-device lock", async () => {
    const mqtt = new RecordingMqttPublisher();
    const intent: IntentPayload = {
      skill: "greenhouse.open_vent",
      target: { greenhouse_id: "gh-001" },
      parameters: { duration_seconds: 120 },
    };
    const ctxA: RouteContext = {
      user_id: "u-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-inflight-race-a",
      mqtt,
      skip_confirmation: true,
    };
    const ctxB: RouteContext = {
      user_id: "u-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-inflight-race-b",
      mqtt,
      skip_confirmation: true,
    };
    const target = ventTarget();
    const cmdA = intentToCommand(intent, ctxA, target);
    const cmdB = intentToCommand(intent, ctxB, target);
    if (!cmdA || !cmdB) throw new Error("intentToCommand returned null");

    const [resA, resB] = await Promise.all([
      publishPhysicalCommand({
        intent,
        ctx: ctxA,
        target,
        safety: { allowed: true, requires_confirmation: false, reason: "ok" },
        cmd: cmdA,
      }),
      publishPhysicalCommand({
        intent,
        ctx: ctxB,
        target,
        safety: { allowed: true, requires_confirmation: false, reason: "ok" },
        cmd: cmdB,
      }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(listCommands()).toHaveLength(1);
    expect(mqtt.published).toHaveLength(1);
  });
});
