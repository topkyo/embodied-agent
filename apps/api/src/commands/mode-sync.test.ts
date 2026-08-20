import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applySetModeFromCompletedCommand } from "./mode-sync.js";
import type { CommandRecord } from "./types.js";
import { getSceneMode, resetSceneModesForTests } from "@embodied-agent/runtime";
import { getPlatformRuntimeContext } from "../runtime/context.js";

function completedSetMode(): CommandRecord {
  return {
    command_id: "cmd-sync-1",
    status: "completed",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    command: {
      message_type: "command",
      protocol_version: "0.1",
      command_id: "cmd-sync-1",
      idempotency_key: "idem",
      deployment_id: "dep-gh-pilot-001",
      entity_id: "gh-001",
      node_id: "node-sim-gh-001",
      device_id: "greenhouse-controller-gh-001",
      device_type: "greenhouse_controller",
      action: "set_mode",
      parameters: { mode: "night_vent", max_temp_c: 30, temp_low_c: 28 },
      issued_by: {
        user_id: "owner-001",
        role: "owner",
        platform: "wechat",
        conversation_id: "wx",
      },
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30_000).toISOString(),
    },
  };
}

describe("applySetModeFromCompletedCommand", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "df-mode-sync-"));
    process.env.AGENT_DATA_DIR = dataDir;
    resetSceneModesForTests(getPlatformRuntimeContext());
    applySetModeFromCompletedCommand({
      ...completedSetMode(),
      status: "rejected",
      command: {
        ...completedSetMode().command,
        parameters: { mode: "off" },
      },
    });
  });

  afterEach(() => {
    resetSceneModesForTests(getPlatformRuntimeContext());
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.AGENT_DATA_DIR;
  });

  it("writes mode only when set_mode completed", () => {
    applySetModeFromCompletedCommand(completedSetMode());
    const row = getSceneMode(getPlatformRuntimeContext(), "gh-001");
    expect(row?.mode).toBe("night_vent");
    expect(row?.temp_high_c).toBe(30);
  });

  it("ignores non-terminal or non-set_mode", () => {
    applySetModeFromCompletedCommand(completedSetMode());
    applySetModeFromCompletedCommand({
      ...completedSetMode(),
      status: "sent",
    });
    expect(getSceneMode(getPlatformRuntimeContext(), "gh-001")?.mode).toBe("night_vent");
  });

  it("fails visibly when completed set_mode command has no entity_id", () => {
    const record = completedSetMode();
    delete record.command.entity_id;
    expect(() => applySetModeFromCompletedCommand(record)).toThrow(/missing entity_id/);
  });
});
