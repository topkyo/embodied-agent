import { describe, expect, it } from "vitest";
import { commandEventMatchesRecord } from "./event-identity.js";
import type { CommandEvent, CommandMessage } from "@embodied-agent/core";
import type { CommandRecord } from "./types.js";

function makeCommand(overrides?: Partial<CommandMessage>): CommandMessage {
  return {
    message_type: "command",
    protocol_version: "0.1",
    command_id: "cmd-evt-1",
    idempotency_key: "idem-1",
    deployment_id: "dep-gh-pilot-001",
    node_id: "node-sim-gh-001",
    device_id: "vent-sim-gh-001",
    device_type: "vent_motor",
    action: "open",
    parameters: { duration_seconds: 60 },
    issued_by: {
      user_id: "owner-001",
      role: "owner",
      platform: "wechat",
      conversation_id: "wx-1",
    },
    created_at: "2026-01-01T00:00:00.000Z",
    expires_at: "2026-01-01T00:01:00.000Z",
    ...overrides,
  };
}

function makeRecord(commandOverrides?: Partial<CommandMessage>): CommandRecord {
  const command = makeCommand(commandOverrides);
  return {
    command_id: command.command_id,
    command,
    status: "sent",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function makeEvent(overrides?: Partial<CommandEvent>): CommandEvent {
  return {
    message_type: "command_event",
    protocol_version: "0.1",
    event_id: "evt-1",
    command_id: "cmd-evt-1",
    idempotency_key: "idem-1",
    deployment_id: "dep-gh-pilot-001",
    node_id: "node-sim-gh-001",
    device_id: "vent-sim-gh-001",
    status: "running",
    occurred_at: "2026-01-01T00:00:05.000Z",
    ...overrides,
  };
}

describe("commandEventMatchesRecord", () => {
  it("returns true when all identity fields match", () => {
    const record = makeRecord();
    const event = makeEvent();
    expect(commandEventMatchesRecord(event, record)).toBe(true);
  });

  it("returns false when command_id differs", () => {
    const record = makeRecord();
    const event = makeEvent({ command_id: "cmd-other" });
    expect(commandEventMatchesRecord(event, record)).toBe(false);
  });

  it("returns false when deployment_id differs", () => {
    const record = makeRecord();
    const event = makeEvent({ deployment_id: "dep-other" });
    expect(commandEventMatchesRecord(event, record)).toBe(false);
  });

  it("returns false when node_id differs", () => {
    const record = makeRecord();
    const event = makeEvent({ node_id: "node-other" });
    expect(commandEventMatchesRecord(event, record)).toBe(false);
  });

  it("returns false when device_id differs", () => {
    const record = makeRecord();
    const event = makeEvent({ device_id: "dev-other" });
    expect(commandEventMatchesRecord(event, record)).toBe(false);
  });

  it("returns false when idempotency_key differs", () => {
    const record = makeRecord();
    const event = makeEvent({ idempotency_key: "idem-other" });
    expect(commandEventMatchesRecord(event, record)).toBe(false);
  });

  it("matches when command has extra optional fields (entity_id, config_version)", () => {
    const record = makeRecord({ entity_id: "gh-001", config_version: 2 });
    const event = makeEvent();
    expect(commandEventMatchesRecord(event, record)).toBe(true);
  });
});
