import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { afterEach, describe, expect, it, beforeEach } from "vitest";
import { routeIntent } from "./router.js";
import { clearOperationLogs, listOperationLogs } from "../db/log.js";
import {
  clearAllPendingConfirm,
  getPendingConfirm,
  setPendingConfirm,
} from "../policy/pending-confirm.js";
import type { CommandMessage, IntentPayload } from "@embodied-agent/core";
import { processChatMessage } from "../chat/pipeline.js";
import type { LlmClient } from "@embodied-agent/agent";
import { DEFAULT_DEPLOYMENT_CONTEXT } from "../fixtures/demo-telemetry.js";
import { listSchedulesForUser } from "../report/schedule-store.js";
import { filterAlertRules, setAlertRule } from "../alerts/threshold-store.js";

import { MqttCommandPublisher } from "@embodied-agent/node";
import { applyCommandEvent, clearCommands, listCommands } from "../commands/store.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import { seedDefaultUsers } from "../test/users-fixture.js";
import { recordNodeAppliedConfigVersion } from "@embodied-agent/node";
import { issueNodeToken } from "@embodied-agent/node";
import { ingestHeartbeatMessage } from "../telemetry/store.js";

let testDir: string;

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

const openIntent: IntentPayload = {
  skill: "greenhouse.open_vent",
  target: { greenhouse_id: "gh-001" },
  parameters: { duration_seconds: 600 },
};

const closeIntent: IntentPayload = {
  skill: "greenhouse.close_vent",
  target: { greenhouse_id: "gh-001" },
  parameters: { duration_seconds: 120 },
};

const fanStartIntent: IntentPayload = {
  skill: "fan.start",
  target: { fan_id: "fan-sim-gh-001" },
  parameters: { duration_seconds: 120 },
};

const nightModeIntent: IntentPayload = {
  skill: "greenhouse.set_mode",
  target: { greenhouse_id: "gh-001" },
  parameters: { mode: "night_vent", max_temp_c: 30, temp_low_c: 28 },
};

describe("routeIntent", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("router");
    seedCanonicalSimRegistry();
    seedDefaultUsers();
    recordNodeAppliedConfigVersion("dep-gh-pilot-001", "node-sim-gh-001", 1, "config_applied");
    issueNodeToken("dep-gh-pilot-001", "node-sim-gh-001");
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001", config_version: 1 });
    clearOperationLogs();
    clearCommands();
    clearAllPendingConfirm();
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("publishes irrigation.start with irrigation-specific reply", async () => {
    const mqtt = new RecordingMqttPublisher();
    const { reply, status } = await routeIntent(
      {
        skill: "irrigation.start",
        target: { zone_id: "zone-a" },
        parameters: { duration_seconds: 300 },
      },
      {
        user_id: "owner-001",
        role: "owner",
        model: "mock",
        conversation_id: "conv-irrigation",
        skip_confirmation: true,
        mqtt,
      },
    );
    expect(status).toBe(200);
    expect(reply).toContain("灌溉");
    expect(reply).not.toContain("通风");
    expect(mqtt.published[0]?.device_type).toBe("irrigation_valve");
  });

  it("publishes owner open_vent and records sent", async () => {
    const mqtt = new RecordingMqttPublisher();
    const { reply, status } = await routeIntent(openIntent, {
      user_id: "owner-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-open",
      skip_confirmation: true,
      mqtt,
    });
    expect(status).toBe(200);
    expect(reply).toContain("已下发");
    expect(mqtt.published[0]?.action).toBe("open");
    expect(listCommands()[0]?.status).toBe("sent");
    expect(listOperationLogs()[0]?.result).toBe("sent");
  });

  it("uses short delivery TTL separate from action duration", async () => {
    const mqtt = new RecordingMqttPublisher();
    await routeIntent(openIntent, {
      user_id: "owner-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-ttl",
      skip_confirmation: true,
      mqtt,
    });
    const cmd = mqtt.published[0]!;
    const createdAt = new Date(cmd.created_at).getTime();
    const expiresAt = new Date(cmd.expires_at).getTime();
    const deliveryTtlMs = expiresAt - createdAt;
    expect(deliveryTtlMs).toBeLessThanOrEqual(30_000);
    expect(deliveryTtlMs).toBeGreaterThan(0);
    expect(cmd.parameters?.duration_seconds).toBe(600);
  });

  it("fails physical control without MQTT instead of fake completed", async () => {
    const { reply, status } = await routeIntent(openIntent, {
      user_id: "owner-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-no-mqtt",
      skip_confirmation: true,
    });
    expect(status).toBe(503);
    expect(reply).toContain("设备链路不可用");
    expect(listOperationLogs()[0]?.result).toBe("failed");
  });

  it("fails fan.start without MQTT instead of fake completed", async () => {
    const { reply, status } = await routeIntent(fanStartIntent, {
      user_id: "owner-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-fan-no-mqtt",
      skip_confirmation: true,
    });
    expect(status).toBe(503);
    expect(reply).toContain("设备链路不可用");
  });

  it("asks fan duration when missing instead of defaulting 900s", async () => {
    const { reply, status } = await routeIntent(
      {
        skill: "fan.start",
        target: { fan_id: "fan-sim-gh-001" },
      },
      {
        user_id: "owner-001",
        role: "owner",
        model: "mock",
        conversation_id: "conv-fan",
      },
    );
    expect(status).toBe(200);
    expect(reply).toContain("多久");
    expect(listOperationLogs()[0]?.result).toBe("clarification");
  });

  it("requires confirmation for vent longer than 10 minutes", async () => {
    const { reply, status } = await routeIntent(
      {
        skill: "greenhouse.open_vent",
        target: { greenhouse_id: "gh-001" },
        parameters: { duration_seconds: 1200 },
      },
      {
        user_id: "owner-001",
        role: "owner",
        model: "mock",
        conversation_id: "conv-cap",
      },
    );
    expect(status).toBe(200);
    expect(reply).toContain("确认");
    const pending = getPendingConfirm("owner-001", "conv-cap");
    expect(pending?.intent.skill).toBe("greenhouse.open_vent");
    if (pending?.intent.skill === "greenhouse.open_vent") {
      const params = pending.intent.parameters as { duration_seconds?: number };
      expect(params.duration_seconds).toBe(1200);
    }
  });

  it("does not expose command_id in user reply", async () => {
    const mqtt = new RecordingMqttPublisher();
    const { reply } = await routeIntent(openIntent, {
      user_id: "owner-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-reply",
      skip_confirmation: true,
      mqtt,
    });
    expect(reply).not.toContain("command_id");
  });

  it("maps close_vent to close command and accepts completion event", async () => {
    const mqtt = new RecordingMqttPublisher();
    const { status } = await routeIntent(closeIntent, {
      user_id: "owner-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-close",
      skip_confirmation: true,
      mqtt,
    });
    expect(status).toBe(200);
    const cmd = mqtt.published[0]!;
    expect(cmd.action).toBe("close");
    expect(cmd.parameters).toEqual({ duration_seconds: 120 });
    applyCommandEvent({
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: "evt-test-close",
      command_id: cmd.command_id,
      idempotency_key: cmd.idempotency_key,
      deployment_id: cmd.deployment_id,
      node_id: cmd.node_id,
      device_id: cmd.device_id,
      status: "completed",
      occurred_at: new Date().toISOString(),
    });
    expect(listCommands()[0]?.status).toBe("completed");
  });

  it("rejects opposite vent direction while runtime state is running", async () => {
    const mqtt = new RecordingMqttPublisher();
    await routeIntent(openIntent, {
      user_id: "owner-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-running-open",
      skip_confirmation: true,
      mqtt,
    });
    const cmd = mqtt.published[0]!;
    applyCommandEvent({
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: "evt-test-running",
      command_id: cmd.command_id,
      idempotency_key: cmd.idempotency_key,
      deployment_id: cmd.deployment_id,
      node_id: cmd.node_id,
      device_id: cmd.device_id,
      status: "running",
      occurred_at: new Date().toISOString(),
    });

    const { status, reply } = await routeIntent(closeIntent, {
      user_id: "owner-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-running-close",
      skip_confirmation: true,
      mqtt,
    });
    expect(status).toBe(403);
    expect(reply).toContain("相反方向");
  });

  it("requires confirmation for 600s vent and stores pending", async () => {
    const { reply, status } = await routeIntent(openIntent, {
      user_id: "owner-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-1",
    });
    expect(status).toBe(200);
    expect(reply).toContain("确认");
    const pending = getPendingConfirm("owner-001", "conv-1");
    expect(pending?.intent.skill).toBe("greenhouse.open_vent");
  });

  it("executes pending after confirm via pipeline", async () => {
    setPendingConfirm({
      intent: openIntent,
      user_id: "owner-001",
      conversation_id: "conv-1",
      model: "mock",
    });
    const mqtt = new RecordingMqttPublisher();
    const { reply, status } = await processChatMessage(
      {
        platform: "dev",
        conversation_id: "conv-1",
        user_id: "owner-001",
        text: "确认。",
        timestamp: new Date().toISOString(),
      },
      {
        llmClient: {
          async completeJson() {
            throw new Error("确认路径不应调用 LLM");
          },
          async completeText() {
            throw new Error("确认路径不应调用 LLM");
          },
        } satisfies LlmClient,
        model: "live",
        deploymentContext: DEFAULT_DEPLOYMENT_CONTEXT,
        mqtt,
        mqttEnabled: true,
      },
    );
    expect(status).toBe(200);
    expect(reply).toContain("已下发");
    expect(getPendingConfirm("owner-001", "conv-1")).toBeUndefined();
  });

  it("rejects worker open_vent", async () => {
    const { status, reply } = await routeIntent(openIntent, {
      user_id: "worker-001",
      role: "worker",
      model: "mock",
      conversation_id: "conv-worker-open",
      skip_confirmation: true,
    });
    expect(status).toBe(403);
    expect(reply).toContain("工人");
  });

  it("requires confirmation for night_vent set_mode", async () => {
    const { reply } = await routeIntent(nightModeIntent, {
      user_id: "owner-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-2",
    });
    expect(reply).toContain("夜间");
    expect(reply).toContain("确认");
  });

  it("persists report.set_schedule", async () => {
    const intent: IntentPayload = {
      skill: "report.set_schedule",
      target: {},
      parameters: {
        greenhouse_ids: ["gh-001", "gh-002"],
        interval_minutes: 15,
      },
    };
    const { reply, status } = await routeIntent(intent, {
      user_id: "owner-001",
      role: "owner",
      model: "mock",
      skip_confirmation: true,
    });
    expect(status).toBe(200);
    expect(reply).toContain("定时汇报");
    const rows = listSchedulesForUser("owner-001");
    expect(rows[0]?.entity_ids).toEqual(["gh-001", "gh-002"]);
  });

  it("query and clear alert thresholds", async () => {
    setAlertRule({
      entity_id: "gh-001",
      metric: "temperature_c",
      operator: ">",
      value: 28,
      updated_by: "owner-001",
    });

    const queryIntent: IntentPayload = {
      skill: "alert.query_threshold",
      target: { greenhouse_id: "gh-001" },
    };
    const q = await routeIntent(queryIntent, {
      user_id: "owner-001",
      role: "owner",
      model: "mock",
      skip_confirmation: true,
    });
    expect(q.status).toBe(200);
    expect(q.reply).toContain("28");

    const clearIntent: IntentPayload = {
      skill: "alert.clear_threshold",
      target: { greenhouse_id: "gh-001" },
      parameters: { metric: "temperature_c" },
    };
    const c = await routeIntent(clearIntent, {
      user_id: "owner-001",
      role: "owner",
      model: "mock",
      skip_confirmation: true,
    });
    expect(c.status).toBe(200);
    expect(filterAlertRules("gh-001")).toHaveLength(0);
  });

  it("queries report schedule for user", async () => {
    await routeIntent(
      {
        skill: "report.set_schedule",
        target: {},
        parameters: { greenhouse_ids: ["gh-001"], interval_minutes: 20 },
      },
      {
        user_id: "owner-001",
        role: "owner",
        model: "mock",
        skip_confirmation: true,
      },
    );

    const { reply, status } = await routeIntent(
      {
        skill: "report.query_schedule",
        target: {},
      },
      {
        user_id: "owner-001",
        role: "owner",
        model: "mock",
        skip_confirmation: true,
      },
    );
    expect(status).toBe(200);
    expect(reply).toContain("20");
  });
});
