import { describe, expect, it } from "vitest";
import { commandMessageSchema, commandEventSchema, nodeEventSchema } from "./schemas/command.js";

const baseCommand = {
  message_type: "command",
  protocol_version: "0.1",
  command_id: "cmd-001",
  idempotency_key: "idem-001",
  deployment_id: "dep-001",
  entity_id: "entity-001",
  node_id: "node-001",
  device_id: "device-001",
  device_type: "vent",
  action: "domain.custom_action",
  parameters: {},
  issued_by: {
    user_id: "user-001",
    role: "operator",
    platform: "web",
    conversation_id: "conv-001",
  },
  created_at: "2026-06-16T00:00:00.000Z",
  expires_at: "2026-06-16T00:01:00.000Z",
};

describe("commandMessageSchema", () => {
  it("accepts non-empty Domain Pack action strings", () => {
    expect(commandMessageSchema.parse(baseCommand).action).toBe("domain.custom_action");
  });

  it("rejects empty action strings", () => {
    expect(commandMessageSchema.safeParse({ ...baseCommand, action: "" }).success).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(commandMessageSchema.safeParse({}).success).toBe(false);
  });

  it("accepts optional safety_limits", () => {
    const withLimits = {
      ...baseCommand,
      safety_limits: {
        max_duration_seconds: 600,
        require_manual_override_clear: true,
      },
    };
    expect(commandMessageSchema.parse(withLimits).safety_limits?.max_duration_seconds).toBe(600);
  });

  it("accepts optional intent_id and node_token", () => {
    const withOptional = {
      ...baseCommand,
      intent_id: "intent-001",
      node_token: "token-abc",
      config_version: 2,
    };
    expect(commandMessageSchema.parse(withOptional).intent_id).toBe("intent-001");
    expect(commandMessageSchema.parse(withOptional).node_token).toBe("token-abc");
  });

  it("rejects non-positive max_duration_seconds in safety_limits", () => {
    expect(
      commandMessageSchema.safeParse({
        ...baseCommand,
        safety_limits: { max_duration_seconds: 0 },
      }).success,
    ).toBe(false);
  });

  it("rejects non-integer max_duration_seconds in safety_limits", () => {
    expect(
      commandMessageSchema.safeParse({
        ...baseCommand,
        safety_limits: { max_duration_seconds: 1.5 },
      }).success,
    ).toBe(false);
  });

  it("rejects invalid message_type", () => {
    expect(commandMessageSchema.safeParse({ ...baseCommand, message_type: "event" }).success).toBe(
      false,
    );
  });

  it("rejects invalid protocol_version", () => {
    expect(
      commandMessageSchema.safeParse({ ...baseCommand, protocol_version: "1.0" }).success,
    ).toBe(false);
  });

  it("rejects negative config_version", () => {
    expect(commandMessageSchema.safeParse({ ...baseCommand, config_version: -1 }).success).toBe(
      false,
    );
  });

  it("rejects invalid datetime for created_at", () => {
    expect(
      commandMessageSchema.safeParse({ ...baseCommand, created_at: "not-a-date" }).success,
    ).toBe(false);
  });
});

const baseCommandEvent = {
  message_type: "command_event" as const,
  protocol_version: "0.1",
  event_id: "evt-001",
  command_id: "cmd-001",
  idempotency_key: "idem-001",
  deployment_id: "dep-001",
  node_id: "node-001",
  device_id: "device-001",
  status: "completed" as const,
  occurred_at: "2026-06-16T00:00:30.000Z",
};

describe("commandEventSchema", () => {
  it("accepts a valid command event", () => {
    expect(commandEventSchema.parse(baseCommandEvent)).toEqual(baseCommandEvent);
  });

  it("accepts all valid status values", () => {
    for (const status of ["acknowledged", "running", "completed", "failed", "rejected"]) {
      expect(commandEventSchema.parse({ ...baseCommandEvent, status }).status).toBe(status);
    }
  });

  it("rejects invalid status enum", () => {
    expect(commandEventSchema.safeParse({ ...baseCommandEvent, status: "pending" }).success).toBe(
      false,
    );
  });

  it("accepts optional runtime_limit_seconds", () => {
    const withLimit = { ...baseCommandEvent, runtime_limit_seconds: 600 };
    expect(commandEventSchema.parse(withLimit).runtime_limit_seconds).toBe(600);
  });

  it("rejects zero runtime_limit_seconds", () => {
    expect(
      commandEventSchema.safeParse({
        ...baseCommandEvent,
        runtime_limit_seconds: 0,
      }).success,
    ).toBe(false);
  });

  it("accepts optional result object", () => {
    const withResult = {
      ...baseCommandEvent,
      result: { temperature: 25.5 },
    };
    expect(commandEventSchema.parse(withResult).result).toEqual({ temperature: 25.5 });
  });

  it("accepts optional error object", () => {
    const withError = {
      ...baseCommandEvent,
      status: "failed" as const,
      error: { code: "DEVICE_TIMEOUT", message: "Device did not respond" },
    };
    expect(commandEventSchema.parse(withError).error?.code).toBe("DEVICE_TIMEOUT");
  });

  it("rejects error with empty code", () => {
    expect(
      commandEventSchema.safeParse({
        ...baseCommandEvent,
        error: { code: "", message: "msg" },
      }).success,
    ).toBe(false);
  });

  it("rejects error with empty message", () => {
    expect(
      commandEventSchema.safeParse({
        ...baseCommandEvent,
        error: { code: "ERR", message: "" },
      }).success,
    ).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(commandEventSchema.safeParse({}).success).toBe(false);
  });

  it("rejects invalid message_type", () => {
    expect(
      commandEventSchema.safeParse({
        ...baseCommandEvent,
        message_type: "command",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid datetime for occurred_at", () => {
    expect(
      commandEventSchema.safeParse({
        ...baseCommandEvent,
        occurred_at: "not-a-date",
      }).success,
    ).toBe(false);
  });

  it("accepts optional config_version", () => {
    expect(
      commandEventSchema.parse({ ...baseCommandEvent, config_version: 3 }).config_version,
    ).toBe(3);
  });

  it("rejects negative config_version", () => {
    expect(
      commandEventSchema.safeParse({
        ...baseCommandEvent,
        config_version: -1,
      }).success,
    ).toBe(false);
  });
});

const baseNodeEvent = {
  message_type: "node_event" as const,
  protocol_version: "0.1",
  event_id: "evt-002",
  event_type: "config_applied" as const,
  deployment_id: "dep-001",
  node_id: "node-001",
  config_version: 3,
  occurred_at: "2026-06-16T00:00:00.000Z",
};

describe("nodeEventSchema", () => {
  it("accepts a valid config_applied node event", () => {
    expect(nodeEventSchema.parse(baseNodeEvent)).toEqual(baseNodeEvent);
  });

  it("accepts config_rejected event_type", () => {
    expect(
      nodeEventSchema.parse({ ...baseNodeEvent, event_type: "config_rejected" }).event_type,
    ).toBe("config_rejected");
  });

  it("rejects invalid event_type enum", () => {
    expect(
      nodeEventSchema.safeParse({ ...baseNodeEvent, event_type: "config_pending" }).success,
    ).toBe(false);
  });

  it("accepts optional node_token", () => {
    expect(nodeEventSchema.parse({ ...baseNodeEvent, node_token: "tok-abc" }).node_token).toBe(
      "tok-abc",
    );
  });

  it("accepts optional error object", () => {
    const withError = {
      ...baseNodeEvent,
      event_type: "config_rejected" as const,
      error: { code: "VERSION_MISMATCH", message: "Stale config" },
    };
    expect(nodeEventSchema.parse(withError).error?.code).toBe("VERSION_MISMATCH");
  });

  it("rejects missing config_version", () => {
    const { config_version: _, ...withoutVersion } = baseNodeEvent;
    expect(nodeEventSchema.safeParse(withoutVersion).success).toBe(false);
  });

  it("rejects negative config_version", () => {
    expect(nodeEventSchema.safeParse({ ...baseNodeEvent, config_version: -1 }).success).toBe(false);
  });

  it("rejects non-integer config_version", () => {
    expect(nodeEventSchema.safeParse({ ...baseNodeEvent, config_version: 1.5 }).success).toBe(
      false,
    );
  });

  it("rejects missing required fields", () => {
    expect(nodeEventSchema.safeParse({}).success).toBe(false);
  });

  it("rejects invalid message_type", () => {
    expect(nodeEventSchema.safeParse({ ...baseNodeEvent, message_type: "command" }).success).toBe(
      false,
    );
  });

  it("rejects invalid datetime for occurred_at", () => {
    expect(nodeEventSchema.safeParse({ ...baseNodeEvent, occurred_at: "invalid" }).success).toBe(
      false,
    );
  });
});
