import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandMessage } from "@embodied-agent/core";
import { MqttCommandPublisher } from "@embodied-agent/node";
import { createCommand, listCommands } from "./store.js";
import { publishPreparedCommand } from "./publish-prepared.js";
import * as configSync from "@embodied-agent/node";

let testDir: string;

class StubMqtt extends MqttCommandPublisher {
  commands: CommandMessage[] = [];

  constructor() {
    super("mqtt://127.0.0.1:1883");
  }

  override async connect(): Promise<void> {}

  override async publishCommand(cmd: CommandMessage): Promise<void> {
    this.commands.push(cmd);
  }

  override async publishNodeConfig(): Promise<void> {}
}

function sampleCommand(): CommandMessage {
  const now = new Date().toISOString();
  return {
    message_type: "command",
    protocol_version: "0.1",
    command_id: "cmd-pub-1",
    idempotency_key: "idem-pub-1",
    deployment_id: "dep-gh-pilot-001",
    node_id: "node-sim-gh-001",
    config_version: 1,
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
    created_at: now,
    expires_at: now,
  };
}

describe("publishPreparedCommand", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    vi.spyOn(configSync, "prepareCommandForPublish").mockResolvedValue({
      ok: true,
      command: sampleCommand(),
      config_version: 1,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    releaseAgentDataDir(testDir);
  });

  it("rejects publish when node_token is missing", async () => {
    const cmd = sampleCommand();
    createCommand(cmd);
    const mqtt = new StubMqtt();

    const result = await publishPreparedCommand({
      command: cmd,
      commandId: cmd.command_id,
      deploymentId: cmd.deployment_id,
      mqtt,
      waitMs: 0,
    });

    expect(result).toEqual({
      ok: false,
      code: "node_token_missing",
      message: "节点未签发 node_token，拒绝下发 MQTT 指令",
    });
    expect(mqtt.commands).toHaveLength(0);
    const stored = listCommands(cmd.deployment_id).find((r) => r.command_id === cmd.command_id);
    expect(stored?.status).toBe("failed");
    expect(stored?.error?.code).toBe("node_token_missing");
  });
});
