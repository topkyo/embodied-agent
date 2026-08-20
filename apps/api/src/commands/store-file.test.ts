import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import {
  applyCommandEvent,
  clearCommands,
  createCommand,
  getInFlightCommandForDevice,
  markCommandFailed,
  markCommandSent,
  markCommandTimeout,
} from "./store.js";
import { saveRegistry } from "@embodied-agent/node";
import { CANONICAL_SIM_REGISTRY } from "../test/registry-fixture.js";
import type { CommandMessage } from "@embodied-agent/core";

let testDir: string;

const DEPLOYMENT = "dep-gh-pilot-001";
const OTHER_DEPLOYMENT = "dep-other-001";

function makeCommand(overrides: Partial<CommandMessage> = {}): CommandMessage {
  return {
    message_type: "command",
    protocol_version: "0.1",
    command_id: "cmd-" + Math.random().toString(36).slice(2, 10),
    idempotency_key: "idem-" + Math.random().toString(36).slice(2, 8),
    deployment_id: DEPLOYMENT,
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
    ...overrides,
  };
}

function applyEvent(
  command: CommandMessage,
  status: "acknowledged" | "running" | "completed" | "failed" | "rejected",
): void {
  applyCommandEvent({
    message_type: "command_event",
    protocol_version: "0.1",
    event_id: "evt-" + Math.random().toString(36).slice(2, 8),
    command_id: command.command_id,
    idempotency_key: command.idempotency_key,
    deployment_id: command.deployment_id,
    node_id: command.node_id,
    device_id: command.device_id,
    status,
    occurred_at: new Date().toISOString(),
  });
}

describe("getInFlightCommandForDevice", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("store-inflight");
    saveRegistry(CANONICAL_SIM_REGISTRY);
    clearCommands();
    clearCommands(OTHER_DEPLOYMENT);
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("returns the latest in-flight command across created/sent/acknowledged/running", () => {
    const c1 = makeCommand({ command_id: "cmd-inflight-1" });
    createCommand(c1);
    markCommandSent(c1.command_id);
    applyEvent(c1, "acknowledged");

    const c2 = makeCommand({ command_id: "cmd-inflight-2" });
    createCommand(c2);
    markCommandSent(c2.command_id);
    applyEvent(c2, "running");

    const got = getInFlightCommandForDevice({
      deploymentId: DEPLOYMENT,
      deviceId: "vent-sim-gh-001",
    });
    expect(got?.command_id).toBe("cmd-inflight-2");
  });

  it("returns a created (unsent) command as in-flight", () => {
    const c = makeCommand({ command_id: "cmd-created-only" });
    createCommand(c);
    const got = getInFlightCommandForDevice({
      deploymentId: DEPLOYMENT,
      deviceId: "vent-sim-gh-001",
    });
    expect(got?.command_id).toBe("cmd-created-only");
    expect(got?.status).toBe("created");
  });

  it("returns undefined when all commands are terminal", () => {
    const c = makeCommand({ command_id: "cmd-terminal" });
    createCommand(c);
    markCommandSent(c.command_id);
    applyEvent(c, "completed");

    const failed = makeCommand({ command_id: "cmd-failed" });
    createCommand(failed);
    markCommandFailed(failed.command_id, { code: "x", message: "boom" });

    const timedOut = makeCommand({ command_id: "cmd-timeout" });
    createCommand(timedOut);
    markCommandSent(timedOut.command_id);
    markCommandTimeout(timedOut.command_id);

    const rejected = makeCommand({ command_id: "cmd-rejected" });
    createCommand(rejected);
    markCommandSent(rejected.command_id);
    applyEvent(rejected, "rejected");

    expect(
      getInFlightCommandForDevice({
        deploymentId: DEPLOYMENT,
        deviceId: "vent-sim-gh-001",
      }),
    ).toBeUndefined();
  });

  it("isolates by device_id", () => {
    const c = makeCommand({ command_id: "cmd-dev-a", device_id: "vent-sim-gh-001" });
    createCommand(c);
    expect(
      getInFlightCommandForDevice({
        deploymentId: DEPLOYMENT,
        deviceId: "other-device",
      }),
    ).toBeUndefined();
    expect(
      getInFlightCommandForDevice({
        deploymentId: DEPLOYMENT,
        deviceId: "vent-sim-gh-001",
      })?.command_id,
    ).toBe("cmd-dev-a");
  });

  it("isolates by deployment_id", () => {
    const c = makeCommand({ command_id: "cmd-dep-a", deployment_id: DEPLOYMENT });
    createCommand(c);
    expect(
      getInFlightCommandForDevice({
        deploymentId: OTHER_DEPLOYMENT,
        deviceId: "vent-sim-gh-001",
      }),
    ).toBeUndefined();
  });
});
