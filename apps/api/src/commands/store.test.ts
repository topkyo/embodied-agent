import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import {
  applyCommandEvent,
  canApplyCommandEvent,
  clearCommands,
  createCommand,
  getCommand,
  markCommandSent,
  markCommandTimeout,
  recordCommandRetry,
} from "./store.js";
import { saveRegistry } from "@embodied-agent/node";
import { CANONICAL_SIM_REGISTRY } from "../test/registry-fixture.js";

let testDir: string;

const baseCommand = {
  message_type: "command" as const,
  protocol_version: "0.1" as const,
  command_id: "cmd-store-test-1",
  idempotency_key: "idem-1",
  deployment_id: "dep-gh-pilot-001",
  node_id: "node-sim-gh-001",
  device_id: "vent-sim-gh-001",
  device_type: "vent_motor" as const,
  action: "open" as const,
  parameters: { duration_seconds: 60 },
  issued_by: {
    user_id: "owner-001",
    role: "owner",
    platform: "dev",
    conversation_id: "dev-001",
  },
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 30_000).toISOString(),
};

describe("command store lifecycle", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("command-store");
    clearCommands();
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("allows forward event transitions", () => {
    expect(canApplyCommandEvent("sent", "acknowledged")).toBe(true);
    expect(canApplyCommandEvent("sent", "running")).toBe(true);
    expect(canApplyCommandEvent("running", "completed")).toBe(true);
  });

  it("rejects terminal regressions", () => {
    // ensure registry for snapshot load in completed apply (telemetry flywheel)
    saveRegistry(CANONICAL_SIM_REGISTRY);
    createCommand(baseCommand);
    markCommandSent(baseCommand.command_id);
    applyCommandEvent({
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: "evt-1",
      command_id: baseCommand.command_id,
      idempotency_key: baseCommand.idempotency_key,
      deployment_id: baseCommand.deployment_id,
      node_id: baseCommand.node_id,
      device_id: baseCommand.device_id,
      status: "running",
      occurred_at: new Date().toISOString(),
    });
    const completed = applyCommandEvent({
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: "evt-1b",
      command_id: baseCommand.command_id,
      idempotency_key: baseCommand.idempotency_key,
      deployment_id: baseCommand.deployment_id,
      node_id: baseCommand.node_id,
      device_id: baseCommand.device_id,
      status: "completed",
      result: { reason: "duration_elapsed", actual_duration_seconds: 8 },
      occurred_at: new Date().toISOString(),
    });
    expect(completed?.result).toEqual({
      reason: "duration_elapsed",
      actual_duration_seconds: 8,
    });
    const stuck = applyCommandEvent({
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: "evt-2",
      command_id: baseCommand.command_id,
      idempotency_key: baseCommand.idempotency_key,
      deployment_id: baseCommand.deployment_id,
      node_id: baseCommand.node_id,
      device_id: baseCommand.device_id,
      status: "running",
      occurred_at: new Date().toISOString(),
    });
    expect(stuck?.status).toBe("completed");
  });

  it("marks timeout only from sent", () => {
    createCommand(baseCommand);
    markCommandSent(baseCommand.command_id);
    const timedOut = markCommandTimeout(baseCommand.command_id);
    expect(timedOut?.status).toBe("timeout");
    expect(timedOut?.error?.code).toBe("ack_timeout");
  });

  it("records retry count while staying sent", () => {
    createCommand(baseCommand);
    markCommandSent(baseCommand.command_id);
    recordCommandRetry(baseCommand.command_id);
    recordCommandRetry(baseCommand.command_id);
    const after = markCommandTimeout(baseCommand.command_id);
    expect(after?.retry_count).toBe(2);
    expect(after?.status).toBe("timeout");
  });

  it("ignores command events that do not match the stored command identity", () => {
    createCommand(baseCommand);
    markCommandSent(baseCommand.command_id);

    const result = applyCommandEvent({
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: "evt-wrong-node",
      command_id: baseCommand.command_id,
      idempotency_key: baseCommand.idempotency_key,
      deployment_id: baseCommand.deployment_id,
      node_id: "node-sim-gh-002",
      device_id: baseCommand.device_id,
      status: "completed",
      occurred_at: new Date().toISOString(),
    });

    expect(result).toBeUndefined();
    expect(getCommand(baseCommand.command_id)?.status).toBe("sent");
  });
});
