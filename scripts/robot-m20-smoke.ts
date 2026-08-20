import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LlmClient } from "@embodied-agent/agent";
import { startM20Stub } from "./m20-stub.js";

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

async function postJson(baseUrl: string, path: string, body: unknown, admin = false) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(admin ? { "x-admin-token": "dev-admin" } : {}),
      ...(!admin ? { Authorization: "Bearer m20-dev-secret" } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

async function getJson(baseUrl: string, path: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "x-admin-token": "dev-admin" },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

function scriptedLlm(): LlmClient {
  return {
    async completeJson(_system, user) {
      if (user.includes("拍") || user.includes("照片")) {
        return JSON.stringify({
          skill: "robot.capture_image",
          target: {},
          parameters: { source: "body" },
        });
      }
      if (user.includes("站")) {
        return JSON.stringify({ skill: "robot.stand_up", target: {}, parameters: {} });
      }
      if (user.includes("导航")) {
        return JSON.stringify({
          skill: "robot.navigate_to_waypoint",
          target: {},
          parameters: { waypoint_id: "dock" },
        });
      }
      return JSON.stringify({ skill: "robot.query_status", target: {}, parameters: {} });
    },
    async completeText(_system, user) {
      return user;
    },
  };
}

async function seedData(dir: string, m20BaseUrl: string): Promise<void> {
  const deploymentId = "dep-robot-m20-dev";
  await writeFile(
    join(dir, "settings.json"),
    JSON.stringify(
      {
        deployment_id: deploymentId,
        deployment_name: "M20 Robot Dev",
        llm_provider: "deepseek",
        llm_base_url: "https://api.deepseek.com/v1",
        llm_model: "deepseek-v4-flash",
        llm_thinking: false,
        stt_provider: "none",
        stt_model: "whisper-1",
        mqtt_url: "mqtt://127.0.0.1:1883",
        integration_secret: "m20-dev-secret",
        active_domain: "robotics",
        domain_configs: {
          robotics: {
            m20_base_url: m20BaseUrl,
            default_robot_id: "m20-001",
            waypoints: [{ waypoint_id: "dock", name: "充电桩", points: [{ x: 0, y: 0, yaw: 0 }] }],
          },
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(dir, "device-registry.json"),
    JSON.stringify(
      {
        deployments: [
          {
            deployment_id: deploymentId,
            name: "M20 Robot Dev",
            timezone: "Asia/Shanghai",
            status: "active",
          },
        ],
        entities: [
          {
            entity_id: "m20-001",
            deployment_id: deploymentId,
            domain_id: "robotics",
            entity_type: "robot",
            name: "M20 机器狗",
            aliases: ["机器狗", "M20"],
            status: "active",
          },
        ],
        nodes: [
          {
            node_id: "m20-001",
            deployment_id: deploymentId,
            entity_id: "m20-001",
            status: "active",
          },
        ],
        devices: [
          {
            device_id: "m20-001",
            deployment_id: deploymentId,
            entity_id: "m20-001",
            device_type: "robot_dog",
            name: "M20 机器狗",
            aliases: ["机器狗", "M20"],
            node_id: "m20-001",
            transport: "m20_http",
            status: "active",
            default_for: "robot_dog",
          },
        ],
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(dir, "users.json"),
    JSON.stringify(
      {
        "owner-001": {
          user_id: "owner-001",
          role: "owner",
          deployment_id: deploymentId,
          display_name: "M20 Dev Owner",
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(dir, "platform-bindings.json"),
    JSON.stringify(
      {
        bindings: [
          {
            platform: "wechat",
            platform_user_id: "wx-m20-owner-001",
            principal_user_id: "owner-001",
            bound_at: new Date().toISOString(),
          },
        ],
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  const dataDir = await mkdtemp(join(tmpdir(), "ea-robot-m20-"));
  const stub = await startM20Stub();
  process.env.AGENT_DATA_DIR = dataDir;
  process.env.ADMIN_TOKEN = "dev-admin";
  process.env.NODE_ENV = "development";
  await seedData(dataDir, stub.baseUrl);

  const { initRuntime } = await import("../apps/api/src/runtime/init.js");
  const { buildApp } = await import("../apps/api/src/app.js");
  const { ingestHeartbeatMessage } = await import("../apps/api/src/telemetry/store.js");
  await initRuntime();
  ingestHeartbeatMessage({ message_type: "heartbeat", node_id: "m20-001" }, "dep-robot-m20-dev");
  const app = await buildApp({
    pipeline: {
      llmClient: scriptedLlm(),
      model: "robot-m20-scripted",
      mqttEnabled: false,
    },
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  assert(address && typeof address !== "string", "api listen failed");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const overview = await getJson(baseUrl, "/admin/robot/overview");
    assert(overview.status === 200, "overview failed");
    assert((overview.json.m20 as { ok?: boolean }).ok === true, "m20 overview not ok");

    const chat = await postJson(baseUrl, "/integrations/chat", {
      platform: "wechat",
      user_id: "wx-m20-owner-001",
      conversation_id: "robot-smoke",
      text: "看一下机器狗状态",
    });
    assert(chat.status === 200, `chat status ${chat.status}`);
    const chatReply = String(chat.json.reply ?? "");
    assert(
      chatReply.includes("M20") || chatReply.includes("状态已读取"),
      `chat did not route robot status: ${chatReply}`,
    );

    const image = await postJson(
      baseUrl,
      "/admin/robot/intents",
      { intent: { skill: "robot.capture_image", target: {}, parameters: { source: "body" } } },
      true,
    );
    assert(image.status === 200, "capture intent failed");

    const moveNeedsConfirm = await postJson(
      baseUrl,
      "/admin/robot/intents",
      {
        intent: {
          skill: "robot.move",
          target: { robot_id: "m20-001" },
          parameters: { x: 0.2, duration_ms: 1000 },
        },
      },
      true,
    );
    assert(
      moveNeedsConfirm.status === 409,
      `move should require confirmation: ${moveNeedsConfirm.status} ${JSON.stringify(moveNeedsConfirm.json)}`,
    );
    const moveConfirmed = await postJson(
      baseUrl,
      "/admin/robot/intents",
      {
        intent: {
          skill: "robot.move",
          target: { robot_id: "m20-001" },
          parameters: { x: 0.2, duration_ms: 1000 },
        },
        confirmed: true,
      },
      true,
    );
    assert(
      moveConfirmed.status === 200,
      `confirmed move failed: ${moveConfirmed.status} ${JSON.stringify(moveConfirmed.json)}`,
    );

    const navNeedsConfirm = await postJson(
      baseUrl,
      "/admin/robot/intents",
      {
        intent: {
          skill: "robot.navigate_to_waypoint",
          target: { robot_id: "m20-001" },
          parameters: { waypoint_id: "dock" },
        },
      },
      true,
    );
    assert(
      navNeedsConfirm.status === 409,
      `navigation should require confirmation: ${navNeedsConfirm.status} ${JSON.stringify(navNeedsConfirm.json)}`,
    );
    const navConfirmed = await postJson(
      baseUrl,
      "/admin/robot/intents",
      {
        intent: {
          skill: "robot.navigate_to_waypoint",
          target: { robot_id: "m20-001" },
          parameters: { waypoint_id: "dock" },
        },
        confirmed: true,
      },
      true,
    );
    assert(
      navConfirmed.status === 200,
      `confirmed navigation failed: ${navConfirmed.status} ${JSON.stringify(navConfirmed.json)}`,
    );

    await stub.close();
    const failed = await postJson(
      baseUrl,
      "/admin/robot/intents",
      { intent: { skill: "robot.stand_up", target: {}, parameters: {} } },
      true,
    );
    assert(failed.status === 503, "m20 failure should return 503");
    console.log("robot M20 stub smoke passed");
  } finally {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  }
}

await main();
