import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { countRecentDeviceFailures, deviceEfficiencyNotifyKey } from "./device-failures.js";
import { clearCommands, createCommand, markCommandFailed } from "../commands/store.js";
import type { CommandMessage } from "@embodied-agent/core";

let testDir: string;

describe("device-failures", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    clearCommands("dep-gh-pilot-001");
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("counts recent terminal failures per device", () => {
    const now = new Date().toISOString();
    const template: CommandMessage = {
      message_type: "command",
      protocol_version: "0.1",
      command_id: "cmd-x",
      idempotency_key: "k",
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
      created_at: now,
      expires_at: now,
    };

    for (let i = 0; i < 3; i++) {
      const id = `cmd-f-${i}`;
      createCommand({ ...template, command_id: id, idempotency_key: `k${i}` });
      markCommandFailed(id, { code: "mqtt_unavailable", message: "down" });
    }

    expect(countRecentDeviceFailures("vent-sim-gh-001", "dep-gh-pilot-001")).toBe(3);
  });

  it("builds a stable notify key per deployment+device", () => {
    expect(deviceEfficiencyNotifyKey("dep-1", "dev-1")).toBe("dep-1:dev-1");
    expect(deviceEfficiencyNotifyKey("dep-1", "dev-1")).not.toBe("dep-1:dev-2");
  });
});
