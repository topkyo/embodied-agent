import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCommands, createCommand } from "../../commands/store.js";
import type { CommandRecord } from "../../commands/types.js";
import { executeSkill } from "./index.js";
import {
  formatCommandStatusReply,
  formatSetModeSummaryLines,
  mapQueryActionToStored,
  type GreenhouseCommandFormatServices,
} from "@embodied-agent/domain-agriculture";
import { CANONICAL_SIM_REGISTRY } from "../../test/registry-fixture.js";
import { saveRegistry } from "@embodied-agent/node";

const FORMAT_SERVICES: GreenhouseCommandFormatServices = {
  entityIdFromDeviceId(deviceId) {
    return CANONICAL_SIM_REGISTRY.devices.find((device) => device.device_id === deviceId)
      ?.entity_id;
  },
};

function makeSetModeRecord(
  status: CommandRecord["status"],
  overrides?: Partial<CommandRecord>,
): CommandRecord {
  return {
    command_id: "cmd-mode-1",
    status,
    created_at: "2026-06-07T09:00:00.000Z",
    updated_at: "2026-06-07T09:00:01.000Z",
    command: {
      message_type: "command",
      protocol_version: "0.1",
      command_id: "cmd-mode-1",
      idempotency_key: "idem",
      deployment_id: "dep-gh-pilot-001",
      entity_id: "gh-001",
      node_id: "node-sim-gh-001",
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
      created_at: "2026-06-07T09:00:00.000Z",
      expires_at: "2026-06-07T09:00:30.000Z",
    },
    error:
      status === "rejected"
        ? { code: "config_version_mismatch", message: "expected 2" }
        : undefined,
    ...overrides,
  };
}

describe("formatCommandStatusReply", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "command-status-fmt-"));
    process.env.AGENT_DATA_DIR = testDir;
    saveRegistry(CANONICAL_SIM_REGISTRY);
  });

  afterEach(() => {
    delete process.env.AGENT_DATA_DIR;
    rmSync(testDir, { recursive: true, force: true });
  });

  it("describes rejected set_mode with config hint", () => {
    const reply = formatCommandStatusReply(makeSetModeRecord("rejected"), FORMAT_SERVICES);
    expect(reply).toContain("未生效");
    expect(reply).toContain("配置版本");
  });

  it("describes completed night_vent", () => {
    const reply = formatCommandStatusReply(makeSetModeRecord("completed"), FORMAT_SERVICES);
    expect(reply).toContain("已开启");
    expect(reply).toContain("30");
  });

  it("describes completed open vent in human language", () => {
    const reply = formatCommandStatusReply(
      {
        ...makeSetModeRecord("completed"),
        command: {
          ...makeSetModeRecord("completed").command,
          device_id: "vent-gh-001-left",
          device_type: "vent_motor",
          action: "open",
          parameters: { duration_seconds: 900 },
        },
        result: { reason: "duration_elapsed", actual_duration_seconds: 900 },
      },
      FORMAT_SERVICES,
    );
    expect(reply).toContain("侧帘");
    expect(reply).toContain("15 分钟");
    expect(reply).not.toContain("command_id");
  });
});

describe("mapQueryActionToStored", () => {
  it("maps vent query aliases to stored command actions", () => {
    expect(mapQueryActionToStored("open_vent")).toBe("open");
    expect(mapQueryActionToStored("close_vent")).toBe("close");
    expect(mapQueryActionToStored("set_mode")).toBe("set_mode");
    expect(mapQueryActionToStored(undefined)).toBeUndefined();
  });
});

describe("command.query_status handler", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "query-status-"));
    process.env.AGENT_DATA_DIR = testDir;
    saveRegistry(CANONICAL_SIM_REGISTRY);
    clearCommands();
  });

  afterEach(() => {
    delete process.env.AGENT_DATA_DIR;
    rmSync(testDir, { recursive: true, force: true });
  });

  it("finds stored open vent when intent uses action open_vent", async () => {
    const now = new Date().toISOString();
    createCommand({
      message_type: "command",
      protocol_version: "0.1",
      command_id: "cmd-gh001-open",
      idempotency_key: "idem-gh001",
      deployment_id: "dep-gh-pilot-001",
      entity_id: "gh-001",
      node_id: "node-sim-gh-001",
      device_id: "vent-sim-gh-001",
      device_type: "vent_motor",
      action: "open",
      parameters: { duration_seconds: 600 },
      issued_by: {
        user_id: "owner-001",
        role: "owner",
        platform: "dev",
        conversation_id: "dev-001",
      },
      created_at: now,
      expires_at: new Date(Date.now() + 30_000).toISOString(),
    });
    createCommand({
      message_type: "command",
      protocol_version: "0.1",
      command_id: "cmd-gh002-open",
      idempotency_key: "idem-gh002",
      deployment_id: "dep-gh-pilot-001",
      entity_id: "gh-002",
      node_id: "node-sim-gh-002",
      device_id: "vent-sim-gh-002",
      device_type: "vent_motor",
      action: "open",
      parameters: { duration_seconds: 900 },
      issued_by: {
        user_id: "owner-001",
        role: "owner",
        platform: "dev",
        conversation_id: "dev-001",
      },
      created_at: now,
      expires_at: new Date(Date.now() + 30_000).toISOString(),
    });

    const result = await executeSkill(
      {
        skill: "command.query_status",
        target: { greenhouse_id: "gh-002" },
        parameters: { action: "open_vent" },
      },
      { user_id: "owner-001" },
    );

    expect(result.reply).not.toContain("最近没有可查询的指令记录");
    expect(result.reply).toContain("开侧帘");
    expect(result.params.action).toBe("open");
    expect(result.params.status).toBe("created");
    expect(result.params.command_id).toBe("cmd-gh002-open");
  });
});

describe("formatSetModeSummaryLines", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "command-status-summary-"));
    process.env.AGENT_DATA_DIR = testDir;
    saveRegistry(CANONICAL_SIM_REGISTRY);
  });

  afterEach(() => {
    delete process.env.AGENT_DATA_DIR;
    rmSync(testDir, { recursive: true, force: true });
  });

  it("summarizes per greenhouse", () => {
    const lines = formatSetModeSummaryLines(
      [
        makeSetModeRecord("rejected"),
        makeSetModeRecord("completed", {
          command_id: "cmd-mode-2",
          command: {
            ...makeSetModeRecord("completed").command,
            command_id: "cmd-mode-2",
            entity_id: "gh-002",
            device_id: "gh-002",
          },
        }),
      ],
      FORMAT_SERVICES,
    );
    expect(lines).toMatch(/gh-001|1号棚/);
    expect(lines).toMatch(/gh-002|2号棚/);
  });
});
