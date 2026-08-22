import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandMessage } from "@embodied-agent/core";
import type { MqttContext } from "@embodied-agent/node";

const mqttMock = vi.hoisted(() => ({
  published: [] as CommandMessage[],
}));

const fakeMqttCtx: MqttContext = {
  publisher: {
    get: () =>
      ({
        publishCommand: async (cmd: CommandMessage) => {
          mqttMock.published.push(cmd);
        },
        publishNodeConfig: async () => {},
      }) as never,
    status: () => null,
    reset: () => {},
  },
};

import {
  CONFIG_SYNC_MAX_ATTEMPTS,
  CommandLifecycleWatcher,
  evaluateAwaitingAckAction,
  isTransientConfigError,
  rejectNonDispatchableWatcherCommand,
} from "./watcher.js";
import type { CommandRecord } from "./types.js";
import { createCommand, listCommands, markCommandSent } from "./store.js";
import { loadRegistry, saveRegistry } from "@embodied-agent/node";
import { saveSettings } from "../settings/store.js";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";

function makeSentRecord(sentAtMs: number, retryCount = 0): CommandRecord {
  return {
    command_id: "cmd-watcher-1",
    status: "sent",
    created_at: new Date(sentAtMs).toISOString(),
    updated_at: new Date(sentAtMs).toISOString(),
    sent_at: new Date(sentAtMs).toISOString(),
    retry_count: retryCount,
    command: {
      message_type: "command",
      protocol_version: "0.1",
      command_id: "cmd-watcher-1",
      idempotency_key: "idem",
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
      created_at: new Date(sentAtMs).toISOString(),
      expires_at: new Date(sentAtMs + 30_000).toISOString(),
    },
  };
}

function makeCommand(): CommandMessage {
  const now = Date.now();
  return {
    message_type: "command",
    protocol_version: "0.1",
    command_id: "cmd-watcher-dispatch-1",
    idempotency_key: "idem-watcher-dispatch-1",
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
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + 30_000).toISOString(),
  };
}

describe("config sync watcher helpers", () => {
  it("treats config_not_ready as transient", () => {
    expect(isTransientConfigError("config_not_ready")).toBe(true);
    expect(isTransientConfigError("node_not_found")).toBe(false);
    expect(isTransientConfigError("mqtt_publish_failed")).toBe(false);
  });

  it("uses retry budget for config sync", () => {
    expect(CONFIG_SYNC_MAX_ATTEMPTS).toBeGreaterThan(0);
  });
});

describe("evaluateAwaitingAckAction", () => {
  const opts = {
    ackTimeoutMs: 15_000,
    retryIntervalMs: 5_000,
    maxRetries: 2,
  };
  const sentAt = 1_000_000_000_000;

  it("waits until first retry window", () => {
    expect(evaluateAwaitingAckAction(makeSentRecord(sentAt), sentAt + 4999, opts)).toBe("noop");
    expect(evaluateAwaitingAckAction(makeSentRecord(sentAt), sentAt + 5000, opts)).toBe("retry");
  });

  it("retries twice then times out", () => {
    expect(evaluateAwaitingAckAction(makeSentRecord(sentAt, 1), sentAt + 10_000, opts)).toBe(
      "retry",
    );
    expect(evaluateAwaitingAckAction(makeSentRecord(sentAt, 2), sentAt + 12_000, opts)).toBe(
      "noop",
    );
    expect(evaluateAwaitingAckAction(makeSentRecord(sentAt, 2), sentAt + 15_000, opts)).toBe(
      "timeout",
    );
  });
});

describe("rejectNonDispatchableWatcherCommand", () => {
  let testDir: string;

  beforeEach(() => {
    mqttMock.published.length = 0;
    testDir = allocateAgentDataDir("watcher-dispatchability");
    seedCanonicalSimRegistry();
    saveSettings({
      deployment_id: "dep-gh-pilot-001",
      active_domain: "agriculture",
    });
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("marks stale commands failed when device node binding changed before watcher resend", async () => {
    const command = makeCommand();
    createCommand(command);
    const registry = loadRegistry();
    saveRegistry({
      ...registry,
      nodes: [
        ...(registry.nodes ?? []),
        {
          node_id: "node-sim-gh-rebound",
          deployment_id: "dep-gh-pilot-001",
          status: "active",
        },
      ],
      devices: registry.devices.map((device) =>
        device.device_id === "vent-sim-gh-001"
          ? { ...device, node_id: "node-sim-gh-rebound" }
          : device,
      ),
    });

    const record = listCommands()[0];
    if (!record) throw new Error("command record missing");

    await expect(rejectNonDispatchableWatcherCommand(record)).resolves.toBe(true);
    expect(listCommands()[0]).toMatchObject({
      status: "failed",
      error: {
        code: "node_binding_mismatch",
      },
    });
  });

  it("marks current deployment commands failed when node is offline before watcher resend", async () => {
    const command = makeCommand();
    createCommand(command);
    const record = listCommands()[0];
    if (!record) throw new Error("command record missing");

    await expect(rejectNonDispatchableWatcherCommand(record)).resolves.toBe(true);
    expect(listCommands()[0]).toMatchObject({
      status: "failed",
      error: {
        code: "node_offline",
      },
    });
  });

  it("tick ignores non-active deployment commands after active deployment switches", async () => {
    const registry = loadRegistry();
    saveRegistry({
      ...registry,
      deployments: [
        ...registry.deployments,
        {
          deployment_id: "dep-new",
          name: "New Deployment",
          timezone: "UTC",
          status: "active",
        },
      ],
    });
    const command = makeCommand();
    createCommand(command);
    markCommandSent(command.command_id, command.deployment_id);
    saveSettings({
      deployment_id: "dep-new",
      active_domain: "agriculture",
    });

    await new CommandLifecycleWatcher(fakeMqttCtx).tick(Date.now());

    expect(listCommands("dep-gh-pilot-001")[0]).toMatchObject({
      status: "sent",
    });
    expect(mqttMock.published).toHaveLength(0);
  });
});
