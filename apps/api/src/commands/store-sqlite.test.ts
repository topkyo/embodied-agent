import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { resetMemoryJournalForTest } from "../memory/journal.js";
import { saveRegistry } from "@embodied-agent/node";
import { CANONICAL_SIM_REGISTRY } from "../test/registry-fixture.js";
import type { CommandMessage } from "@embodied-agent/core";

let testDir: string;

const baseCommand: CommandMessage = {
  message_type: "command",
  protocol_version: "0.1",
  command_id: "cmd-sqlite-1",
  idempotency_key: "idem-sqlite-1",
  deployment_id: "dep-gh-pilot-001",
  node_id: "node-sim-gh-001",
  device_id: "vent-sim-gh-001",
  device_type: "vent_motor",
  action: "open",
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

async function importStore() {
  return await import("./store-sqlite.js");
}

describe("sqlite command store", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("store-sqlite");
    process.env.COMMAND_STORE = "sqlite";
    process.env.AGENT_DATA_DIR = testDir;
    saveRegistry(CANONICAL_SIM_REGISTRY);
    resetMemoryJournalForTest();
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
    delete process.env.COMMAND_STORE;
  });

  it("creates and retrieves a command", async () => {
    const { createCommand, getCommand } = await importStore();
    const record = createCommand(baseCommand);
    expect(record.status).toBe("created");
    const fetched = getCommand(baseCommand.command_id);
    expect(fetched).toBeDefined();
    expect(fetched?.command_id).toBe(baseCommand.command_id);
    expect(fetched?.status).toBe("created");
  });

  it("marks command as sent", async () => {
    const { createCommand, markCommandSent, getCommand } = await importStore();
    createCommand(baseCommand);
    const sent = markCommandSent(baseCommand.command_id);
    expect(sent?.status).toBe("sent");
    expect(sent?.sent_at).toBeDefined();
    const fetched = getCommand(baseCommand.command_id);
    expect(fetched?.status).toBe("sent");
  });

  it("marks command as timeout only from sent status", async () => {
    const { createCommand, markCommandTimeout, getCommand } = await importStore();
    createCommand(baseCommand);
    // timeout from "created" should fail (not sent)
    const beforeSent = markCommandTimeout(baseCommand.command_id);
    expect(beforeSent).toBeUndefined();
    const fetched = getCommand(baseCommand.command_id);
    expect(fetched?.status).toBe("created");
  });

  it("marks command as timeout after sent", async () => {
    const { createCommand, markCommandSent, markCommandTimeout } = await importStore();
    createCommand(baseCommand);
    markCommandSent(baseCommand.command_id);
    const timedOut = markCommandTimeout(baseCommand.command_id);
    expect(timedOut?.status).toBe("timeout");
    expect(timedOut?.error?.code).toBe("ack_timeout");
  });

  it("records retry count", async () => {
    const { createCommand, markCommandSent, recordCommandRetry, markCommandTimeout } =
      await importStore();
    createCommand(baseCommand);
    markCommandSent(baseCommand.command_id);
    recordCommandRetry(baseCommand.command_id);
    recordCommandRetry(baseCommand.command_id);
    const after = markCommandTimeout(baseCommand.command_id);
    expect(after?.retry_count).toBe(2);
  });

  it("lists commands for a deployment", async () => {
    const { createCommand, listCommands, clearCommands } = await importStore();
    clearCommands();
    createCommand(baseCommand);
    createCommand({
      ...baseCommand,
      command_id: "cmd-sqlite-2",
      idempotency_key: "idem-sqlite-2",
    });
    const all = listCommands("dep-gh-pilot-001");
    expect(all).toHaveLength(2);
  });

  it("clears commands for a deployment", async () => {
    const { createCommand, listCommands, clearCommands } = await importStore();
    createCommand(baseCommand);
    expect(listCommands("dep-gh-pilot-001")).toHaveLength(1);
    clearCommands();
    expect(listCommands("dep-gh-pilot-001")).toHaveLength(0);
  });

  it("lists unsent commands (status=created)", async () => {
    const { createCommand, listUnsentCommands, markCommandSent, clearCommands } =
      await importStore();
    clearCommands();
    createCommand(baseCommand);
    createCommand({
      ...baseCommand,
      command_id: "cmd-sqlite-2b",
      idempotency_key: "test-idempotency-key-2b",
    });
    markCommandSent(baseCommand.command_id);
    const unsent = listUnsentCommands("dep-gh-pilot-001");
    expect(unsent).toHaveLength(1);
    expect(unsent[0].command_id).toBe("cmd-sqlite-2b");
  });

  it("lists awaiting-ack commands (status=sent)", async () => {
    const { createCommand, markCommandSent, listAwaitingAckCommands, clearCommands } =
      await importStore();
    clearCommands();
    createCommand(baseCommand);
    markCommandSent(baseCommand.command_id);
    const awaiting = listAwaitingAckCommands("dep-gh-pilot-001");
    expect(awaiting).toHaveLength(1);
    expect(awaiting[0].command_id).toBe(baseCommand.command_id);
  });

  it("applies a forward command event (sent → running → completed)", async () => {
    const { createCommand, markCommandSent, applyCommandEvent, getCommand, clearCommands } =
      await importStore();
    clearCommands();
    createCommand(baseCommand);
    markCommandSent(baseCommand.command_id);
    const running = applyCommandEvent({
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: "evt-sqlite-1",
      command_id: baseCommand.command_id,
      idempotency_key: baseCommand.idempotency_key,
      deployment_id: baseCommand.deployment_id,
      node_id: baseCommand.node_id,
      device_id: baseCommand.device_id,
      status: "running",
      occurred_at: new Date().toISOString(),
    });
    expect(running?.status).toBe("running");
    const completed = applyCommandEvent({
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: "evt-sqlite-2",
      command_id: baseCommand.command_id,
      idempotency_key: baseCommand.idempotency_key,
      deployment_id: baseCommand.deployment_id,
      node_id: baseCommand.node_id,
      device_id: baseCommand.device_id,
      status: "completed",
      result: { reason: "duration_elapsed", actual_duration_seconds: 8 },
      occurred_at: new Date().toISOString(),
    });
    expect(completed?.status).toBe("completed");
    const fetched = getCommand(baseCommand.command_id);
    expect(fetched?.status).toBe("completed");
    expect(fetched?.result).toEqual({
      reason: "duration_elapsed",
      actual_duration_seconds: 8,
    });
  });

  it("rejects command event with mismatched identity", async () => {
    const { createCommand, markCommandSent, applyCommandEvent, clearCommands } =
      await importStore();
    clearCommands();
    createCommand(baseCommand);
    markCommandSent(baseCommand.command_id);
    const result = applyCommandEvent({
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: "evt-sqlite-mismatch",
      command_id: baseCommand.command_id,
      idempotency_key: baseCommand.idempotency_key,
      deployment_id: baseCommand.deployment_id,
      node_id: "node-wrong",
      device_id: baseCommand.device_id,
      status: "completed",
      occurred_at: new Date().toISOString(),
    });
    expect(result).toBeUndefined();
  });

  it("finds commands for a user", async () => {
    const { createCommand, findCommandsForUser, clearCommands } = await importStore();
    clearCommands();
    createCommand(baseCommand);
    createCommand({
      ...baseCommand,
      command_id: "cmd-sqlite-3",
      idempotency_key: "idem-sqlite-3",
    });
    const found = findCommandsForUser("owner-001", { limit: 10 });
    expect(found).toHaveLength(2);
  });

  it("gets recent command for user", async () => {
    const { createCommand, getRecentCommandForUser, clearCommands } = await importStore();
    clearCommands();
    createCommand(baseCommand);
    const recent = getRecentCommandForUser("owner-001");
    expect(recent).toBeDefined();
    expect(recent?.command.issued_by.user_id).toBe("owner-001");
  });

  it("marks command failed", async () => {
    const { createCommand, markCommandFailed, getCommand, clearCommands } = await importStore();
    clearCommands();
    createCommand(baseCommand);
    const failed = markCommandFailed(baseCommand.command_id, {
      code: "device_error",
      message: "设备离线",
    });
    expect(failed?.status).toBe("failed");
    expect(failed?.error?.code).toBe("device_error");
    const fetched = getCommand(baseCommand.command_id);
    expect(fetched?.status).toBe("failed");
  });

  it("marks command notified", async () => {
    const { createCommand, markCommandNotified, getCommand, clearCommands } = await importStore();
    clearCommands();
    createCommand(baseCommand);
    const notified = markCommandNotified(baseCommand.command_id, "completed");
    expect(notified?.notified_status).toBe("completed");
    const fetched = getCommand(baseCommand.command_id);
    expect(fetched?.notified_status).toBe("completed");
  });

  it("getInFlightCommandForDevice returns running command", async () => {
    const {
      createCommand,
      markCommandSent,
      applyCommandEvent,
      getInFlightCommandForDevice,
      clearCommands,
    } = await importStore();
    clearCommands();
    createCommand(baseCommand);
    markCommandSent(baseCommand.command_id);
    applyCommandEvent({
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: "evt-inflight-1",
      command_id: baseCommand.command_id,
      idempotency_key: baseCommand.idempotency_key,
      deployment_id: baseCommand.deployment_id,
      node_id: baseCommand.node_id,
      device_id: baseCommand.device_id,
      status: "running",
      occurred_at: new Date().toISOString(),
    });
    const inFlight = getInFlightCommandForDevice({
      deploymentId: "dep-gh-pilot-001",
      deviceId: baseCommand.device_id,
    });
    expect(inFlight).toBeDefined();
    expect(inFlight?.status).toBe("running");
  });

  it("getRunningActionForDevice returns action name for running command", async () => {
    const {
      createCommand,
      markCommandSent,
      applyCommandEvent,
      getRunningActionForDevice,
      clearCommands,
    } = await importStore();
    clearCommands();
    createCommand(baseCommand);
    markCommandSent(baseCommand.command_id);
    applyCommandEvent({
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: "evt-running-action",
      command_id: baseCommand.command_id,
      idempotency_key: baseCommand.idempotency_key,
      deployment_id: baseCommand.deployment_id,
      node_id: baseCommand.node_id,
      device_id: baseCommand.device_id,
      status: "running",
      occurred_at: new Date().toISOString(),
    });
    const action = getRunningActionForDevice(baseCommand.device_id);
    expect(action).toBe("open");
  });

  it("patchCommandConfigVersion updates config_version on command", async () => {
    const { createCommand, patchCommandConfigVersion, getCommand, clearCommands } =
      await importStore();
    clearCommands();
    createCommand(baseCommand);
    const patched = patchCommandConfigVersion(baseCommand.command_id, 3);
    expect(patched?.command.config_version).toBe(3);
    const fetched = getCommand(baseCommand.command_id);
    expect(fetched?.command.config_version).toBe(3);
  });

  it("markCommandExecutionSource sets transport and lifecycle source", async () => {
    const { createCommand, markCommandExecutionSource, getCommand, clearCommands } =
      await importStore();
    clearCommands();
    createCommand(baseCommand);
    const marked = markCommandExecutionSource(baseCommand.command_id, {
      execution_transport: "mqtt",
      lifecycle_source: "scene_node_mqtt",
    });
    expect(marked?.execution_transport).toBe("mqtt");
    expect(marked?.lifecycle_source).toBe("scene_node_mqtt");
    const fetched = getCommand(baseCommand.command_id);
    expect(fetched?.execution_transport).toBe("mqtt");
  });

  it("returns undefined for non-existent command", async () => {
    const { getCommand } = await importStore();
    expect(getCommand("nonexistent-cmd")).toBeUndefined();
  });
});
