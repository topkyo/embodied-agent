import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import { issueNodeToken } from "@embodied-agent/node";
import { handleEventMessage } from "./handle-event-message.js";
import { createMqttContext } from "@embodied-agent/node";
import { clearCommands, createCommand } from "../commands/store.js";
import { saveSettings } from "../settings/store.js";

let testDir: string;
const mqttCtx = createMqttContext();

describe("handleEventMessage", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("mqtt-event");
    process.env.DEPLOYMENT_ID = "dep-gh-pilot-001";
    process.env.ACTIVE_DOMAIN = "agriculture";
    seedCanonicalSimRegistry();
    clearCommands();
  });

  afterEach(() => {
    delete process.env.DEPLOYMENT_ID;
    delete process.env.ACTIVE_DOMAIN;
    releaseAgentDataDir(testDir);
  });

  it("drops events with invalid node_token for registered node", () => {
    issueNodeToken("dep-gh-pilot-001", "node-sim-gh-001");
    const topic = "deployments/dep-gh-pilot-001/nodes/node-sim-gh-001/events";
    const result = handleEventMessage(mqttCtx, topic, {
      node_id: "node-sim-gh-001",
      node_token: "wrong",
      message_type: "node_event",
      protocol_version: "0.1",
      event_id: "evt-auth",
      event_type: "config_applied",
      deployment_id: "dep-gh-pilot-001",
      config_version: 2,
      occurred_at: new Date().toISOString(),
    });
    expect(result).toEqual({ kind: "auth_drop", node_id: "node-sim-gh-001" });
  });

  it("drops events when node has no registered token", () => {
    const topic = "deployments/dep-gh-pilot-001/nodes/node-sim-gh-001/events";
    const result = handleEventMessage(mqttCtx, topic, {
      node_id: "node-sim-gh-001",
      node_token: "node-unregistered",
      message_type: "node_event",
      protocol_version: "0.1",
      event_id: "evt-auth-missing-record",
      event_type: "config_applied",
      deployment_id: "dep-gh-pilot-001",
      config_version: 2,
      occurred_at: new Date().toISOString(),
    });
    expect(result).toEqual({ kind: "auth_drop", node_id: "node-sim-gh-001" });
  });

  it("records config_applied node events", () => {
    const token = issueNodeToken("dep-gh-pilot-001", "node-sim-gh-001");
    const topic = "deployments/dep-gh-pilot-001/nodes/node-sim-gh-001/events";
    const result = handleEventMessage(mqttCtx, topic, {
      node_id: "node-sim-gh-001",
      node_token: token,
      message_type: "node_event",
      protocol_version: "0.1",
      event_id: "evt-1",
      event_type: "config_applied",
      deployment_id: "dep-gh-pilot-001",
      config_version: 2,
      occurred_at: new Date().toISOString(),
    });
    expect(result).toEqual({
      kind: "node_event",
      event_type: "config_applied",
      node_id: "node-sim-gh-001",
    });
  });

  it("applies command completion events", () => {
    const token = issueNodeToken("dep-gh-pilot-001", "node-sim-gh-001");
    createCommand({
      message_type: "command",
      protocol_version: "0.1",
      command_id: "cmd-test-001",
      idempotency_key: "idem-1",
      deployment_id: "dep-gh-pilot-001",
      node_id: "node-sim-gh-001",
      device_id: "vent-sim-gh-001",
      device_type: "vent_motor",
      action: "open",
      issued_by: {
        user_id: "u-001",
        role: "owner",
        platform: "dev",
        conversation_id: "c-1",
      },
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    const topic = "deployments/dep-gh-pilot-001/nodes/node-sim-gh-001/events";
    const result = handleEventMessage(mqttCtx, topic, {
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: "evt-cmd-1",
      command_id: "cmd-test-001",
      idempotency_key: "idem-1",
      deployment_id: "dep-gh-pilot-001",
      node_id: "node-sim-gh-001",
      node_token: token,
      device_id: "vent-sim-gh-001",
      status: "completed",
      occurred_at: new Date().toISOString(),
    });
    expect(result.kind).toBe("command_event");
    if (result.kind === "command_event") {
      expect(result.command_id).toBe("cmd-test-001");
      expect(result.status).toBe("completed");
    }
  });

  it("drops command events missing node_token for registered node", () => {
    issueNodeToken("dep-gh-pilot-001", "node-sim-gh-001");
    createCommand({
      message_type: "command",
      protocol_version: "0.1",
      command_id: "cmd-test-002",
      idempotency_key: "idem-2",
      deployment_id: "dep-gh-pilot-001",
      node_id: "node-sim-gh-001",
      device_id: "vent-sim-gh-001",
      device_type: "vent_motor",
      action: "open",
      issued_by: {
        user_id: "u-001",
        role: "owner",
        platform: "dev",
        conversation_id: "c-1",
      },
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    const topic = "deployments/dep-gh-pilot-001/nodes/node-sim-gh-001/events";
    const result = handleEventMessage(mqttCtx, topic, {
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: "evt-cmd-2",
      command_id: "cmd-test-002",
      idempotency_key: "idem-2",
      deployment_id: "dep-gh-pilot-001",
      node_id: "node-sim-gh-001",
      device_id: "vent-sim-gh-001",
      status: "completed",
      occurred_at: new Date().toISOString(),
    });
    expect(result).toEqual({ kind: "auth_drop", node_id: "node-sim-gh-001" });
  });

  it("ignores event payloads whose node_id does not match the topic", () => {
    const token = issueNodeToken("dep-gh-pilot-001", "node-sim-gh-001");
    const topic = "deployments/dep-gh-pilot-001/nodes/node-sim-gh-001/events";
    const result = handleEventMessage(mqttCtx, topic, {
      node_id: "node-sim-gh-002",
      node_token: token,
      message_type: "node_event",
      protocol_version: "0.1",
      event_id: "evt-topic-mismatch",
      event_type: "config_applied",
      deployment_id: "dep-gh-pilot-001",
      config_version: 2,
      occurred_at: new Date().toISOString(),
    });
    expect(result).toEqual({ kind: "ignored" });
  });

  it("ignores event topics outside the active deployment", () => {
    saveSettings({ deployment_id: "dep-robot-pilot-001", active_domain: "agriculture" });
    const token = issueNodeToken("dep-gh-pilot-001", "node-sim-gh-001");
    const topic = "deployments/dep-gh-pilot-001/nodes/node-sim-gh-001/events";
    const result = handleEventMessage(mqttCtx, topic, {
      node_id: "node-sim-gh-001",
      node_token: token,
      message_type: "node_event",
      protocol_version: "0.1",
      event_id: "evt-other-dep",
      event_type: "config_applied",
      deployment_id: "dep-gh-pilot-001",
      config_version: 2,
      occurred_at: new Date().toISOString(),
    });
    expect(result).toEqual({ kind: "ignored" });
  });

  it("ignores unrelated topics", () => {
    expect(handleEventMessage(mqttCtx, "deployments/+/telemetry", { node_id: "x" })).toEqual({
      kind: "ignored",
    });
  });
});
