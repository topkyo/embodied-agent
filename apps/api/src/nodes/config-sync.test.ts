import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CommandMessage } from "@embodied-agent/core";
import { MqttCommandPublisher, bindNodeRuntime } from "@embodied-agent/node";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import {
  getNodeHeartbeat,
  getNodeHeartbeatConfigVersion,
  ingestHeartbeatMessage,
} from "../telemetry/store.js";
import {
  clearConfigPublishCooldownForTests,
  clearNodeAppliedConfigForTests,
  ensureNodeConfigReady,
  formatConfigVersionMismatchDetail,
  getNodeAppliedConfigVersion,
  prepareCommandForPublish,
  recordNodeAppliedConfigVersion,
  registryConfigVersion,
  reloadNodeAppliedConfigForTests,
} from "@embodied-agent/node";

let testDir: string;

class StubMqtt extends MqttCommandPublisher {
  configPublishes = 0;
  commands: CommandMessage[] = [];

  constructor() {
    super("mqtt://127.0.0.1:1883");
  }

  override async connect(): Promise<void> {}

  override async publishNodeConfig(): Promise<void> {
    this.configPublishes += 1;
  }

  override async publishCommand(cmd: CommandMessage): Promise<void> {
    this.commands.push(cmd);
  }
}

function sampleCommand(cv = 1): CommandMessage {
  const now = new Date().toISOString();
  return {
    message_type: "command",
    protocol_version: "0.1",
    command_id: "cmd-cfg-1",
    idempotency_key: "idem-1",
    deployment_id: "dep-gh-pilot-001",
    node_id: "node-sim-gh-001",
    config_version: cv,
    device_id: "gh-001",
    device_type: "greenhouse_controller",
    action: "set_mode",
    parameters: { mode: "night_vent", max_temp_c: 30 },
    issued_by: {
      user_id: "owner-001",
      role: "owner",
      platform: "wechat",
      conversation_id: "wx-1",
    },
    created_at: now,
    expires_at: now,
  };
}

describe("config-sync", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    bindNodeRuntime({
      getNodeHeartbeat,
      getNodeHeartbeatConfigVersion,
    });
    seedCanonicalSimRegistry();
    clearNodeAppliedConfigForTests("dep-gh-pilot-001");
    clearConfigPublishCooldownForTests();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    releaseAgentDataDir(testDir);
  });

  it("formatConfigVersionMismatchDetail humanizes expected N", () => {
    expect(formatConfigVersionMismatchDetail("expected 5", "config_version_mismatch")).toBe(
      "节点当前配置版本为 5，与云端不一致",
    );
  });

  it("persist/hydrate round-trips applied config", () => {
    recordNodeAppliedConfigVersion("dep-gh-pilot-001", "node-sim-gh-001", 3, "config_applied");
    reloadNodeAppliedConfigForTests("dep-gh-pilot-001");
    expect(getNodeAppliedConfigVersion("dep-gh-pilot-001", "node-sim-gh-001")).toBe(3);
    const raw = JSON.parse(
      readFileSync(
        resolve(testDir, "deployments", "dep-gh-pilot-001", "node-applied-config.json"),
        "utf8",
      ),
    ) as {
      nodes: { node_id: string; config_version: number }[];
    };
    expect(raw.nodes).toHaveLength(1);
    expect(raw.nodes[0]?.config_version).toBe(3);
  });

  it("skips disk write when heartbeat cv unchanged", () => {
    recordNodeAppliedConfigVersion("dep-gh-pilot-001", "node-sim-gh-001", 1, "heartbeat");
    const path = resolve(testDir, "deployments", "dep-gh-pilot-001", "node-applied-config.json");
    const mtime1 = readFileSync(path, "utf8");
    recordNodeAppliedConfigVersion("dep-gh-pilot-001", "node-sim-gh-001", 1, "heartbeat");
    const mtime2 = readFileSync(path, "utf8");
    expect(mtime2).toBe(mtime1);
  });

  it("ensureNodeConfigReady passes when applied cv matches registry", async () => {
    recordNodeAppliedConfigVersion("dep-gh-pilot-001", "node-sim-gh-001", 1, "config_applied");
    const mqtt = new StubMqtt();
    const result = await ensureNodeConfigReady({
      node_id: "node-sim-gh-001",
      deployment_id: "dep-gh-pilot-001",
      mqtt,
      waitMs: 100,
    });
    expect(result).toEqual({ ok: true, config_version: 1 });
    expect(mqtt.configPublishes).toBe(0);
  });

  it("ensureNodeConfigReady republishes and waits for alignment", async () => {
    const mqtt = new StubMqtt();
    const promise = ensureNodeConfigReady({
      node_id: "node-sim-gh-001",
      deployment_id: "dep-gh-pilot-001",
      mqtt,
      waitMs: 800,
    });
    await new Promise((r) => setTimeout(r, 200));
    recordNodeAppliedConfigVersion("dep-gh-pilot-001", "node-sim-gh-001", 1, "config_applied");
    const result = await promise;
    expect(result).toEqual({ ok: true, config_version: 1 });
    expect(mqtt.configPublishes).toBe(1);
  });

  it("respects publish cooldown on repeated misalign calls", async () => {
    const mqtt = new StubMqtt();
    await ensureNodeConfigReady({
      node_id: "node-sim-gh-001",
      deployment_id: "dep-gh-pilot-001",
      mqtt,
      waitMs: 50,
    });
    await ensureNodeConfigReady({
      node_id: "node-sim-gh-001",
      deployment_id: "dep-gh-pilot-001",
      mqtt,
      waitMs: 50,
    });
    expect(mqtt.configPublishes).toBe(1);
  });

  it("uses heartbeat config_version as applied fallback", async () => {
    ingestHeartbeatMessage({
      node_id: "node-sim-gh-001",
      config_version: 1,
    });
    const mqtt = new StubMqtt();
    const result = await ensureNodeConfigReady({
      node_id: "node-sim-gh-001",
      deployment_id: "dep-gh-pilot-001",
      mqtt,
      waitMs: 100,
    });
    expect(result).toEqual({ ok: true, config_version: 1 });
    expect(mqtt.configPublishes).toBe(0);
  });

  it("prepareCommandForPublish stamps registry config_version", async () => {
    recordNodeAppliedConfigVersion("dep-gh-pilot-001", "node-sim-gh-001", 1, "config_applied");
    const mqtt = new StubMqtt();
    const prepared = await prepareCommandForPublish(sampleCommand(99), mqtt);
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.command.config_version).toBe(
        registryConfigVersion("dep-gh-pilot-001", "node-sim-gh-001"),
      );
      expect(prepared.command.config_version).toBe(1);
    }
  });
});
