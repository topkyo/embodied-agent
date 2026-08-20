import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildCommandStatusMessage,
  formatDurationZh,
  notifyCommandStatusChange,
  resolveCompletedDurationSeconds,
  simAccelerationSuffix,
} from "./notify.js";
import type { CommandRecord } from "./types.js";
import { CANONICAL_SIM_REGISTRY } from "../test/registry-fixture.js";
import { saveRegistry } from "@embodied-agent/node";
import { saveSettings } from "../settings/store.js";
import { upsertBinding } from "../auth/platform-bind.js";
import { seedDefaultUsers } from "../test/users-fixture.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "notify-test-"));
  process.env.AGENT_DATA_DIR = testDir;
  saveSettings({
    deployment_id: "dep-gh-pilot-001",
    active_domain: "agriculture",
  });
  seedDefaultUsers();
  saveRegistry(CANONICAL_SIM_REGISTRY);
});

afterEach(() => {
  delete process.env.AGENT_DATA_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

function makeRecord(
  status: CommandRecord["status"],
  overrides?: Partial<CommandRecord>,
): CommandRecord {
  return {
    command_id: "cmd-notify-1",
    status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    command: {
      message_type: "command",
      protocol_version: "0.1",
      command_id: "cmd-notify-1",
      idempotency_key: "idem",
      deployment_id: "dep-gh-pilot-001",
      node_id: "node-sim-gh-001",
      device_id: "vent-sim-gh-001",
      device_type: "vent_motor",
      action: "open",
      parameters: { duration_seconds: 600 },
      issued_by: {
        user_id: "owner-001",
        role: "owner",
        platform: "wechat",
        conversation_id: "wx-1",
      },
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30_000).toISOString(),
    },
    error:
      status === "rejected" ? { code: "manual_override_active", message: "手动优先" } : undefined,
    ...overrides,
  };
}

describe("resolveCompletedDurationSeconds", () => {
  it("prefers actual_duration_seconds from device result", () => {
    const record = makeRecord("completed", {
      result: { reason: "duration_elapsed", actual_duration_seconds: 8 },
    });
    expect(resolveCompletedDurationSeconds(record)).toBe(8);
  });

  it("does not infer actual duration from planned duration", () => {
    expect(resolveCompletedDurationSeconds(makeRecord("completed"))).toBeUndefined();
  });
});

describe("formatDurationZh", () => {
  it("formats minutes when divisible by 60", () => {
    expect(formatDurationZh(900)).toBe("15 分钟");
    expect(formatDurationZh(45)).toBe("45 秒");
  });
});

describe("simAccelerationSuffix", () => {
  it("explains when planned far exceeds actual", () => {
    expect(simAccelerationSuffix(900, 8)).toContain("本地模拟加速");
    expect(simAccelerationSuffix(900, 8)).toContain("15 分钟");
  });

  it("empty when actual matches plan", () => {
    expect(simAccelerationSuffix(8, 8)).toBe("");
  });
});

describe("buildCommandStatusMessage", () => {
  it("describes running with greenhouse label and target duration", () => {
    expect(buildCommandStatusMessage(makeRecord("running"))).toContain("1号棚");
    expect(buildCommandStatusMessage(makeRecord("running"))).toContain("10 分钟");
  });

  it("explains sim acceleration when completed early", () => {
    const message = buildCommandStatusMessage(
      makeRecord("completed", {
        command: {
          ...makeRecord("completed").command,
          parameters: { duration_seconds: 900 },
        },
        result: { reason: "duration_elapsed", actual_duration_seconds: 8 },
      }),
    );
    expect(message).toContain("1号棚");
    expect(message).toContain("本地模拟加速");
    expect(message).toContain("15 分钟");
    expect(message).not.toContain("900 秒");
  });

  it("includes rejection reason", () => {
    expect(buildCommandStatusMessage(makeRecord("rejected"))).toContain("手动优先");
  });

  it("describes set_mode rejection with config hint", () => {
    const message = buildCommandStatusMessage(
      makeRecord("rejected", {
        command: {
          ...makeRecord("rejected").command,
          device_id: "gh-001",
          action: "set_mode",
          parameters: { mode: "night_vent", max_temp_c: 30 },
        },
        error: { code: "config_version_mismatch", message: "expected 2" },
      }),
    );
    expect(message).toContain("未生效");
    expect(message).toContain("配置版本");
  });

  it("describes timeout", () => {
    expect(buildCommandStatusMessage(makeRecord("timeout"))).toContain("超时");
  });
});

describe("notifyCommandStatusChange", () => {
  it("sends terminal notification through principal binding", async () => {
    upsertBinding("wechat", "wx_owner_bound", "owner-001");
    const sentTo: string[] = [];
    const sent = await notifyCommandStatusChange(makeRecord("completed"), async (to) => {
      sentTo.push(to);
      return true;
    });
    expect(sent).toBe(true);
    expect(sentTo).toEqual(["wx_owner_bound"]);
  });

  it("does not treat issued_by.user_id as a platform user fallback", async () => {
    upsertBinding("wechat", "wx_owner_bound", "owner-001");
    const sentTo: string[] = [];
    const sent = await notifyCommandStatusChange(
      makeRecord("completed", {
        command: {
          ...makeRecord("completed").command,
          issued_by: {
            ...makeRecord("completed").command.issued_by,
            user_id: "wx_owner_bound",
          },
        },
      }),
      async (to) => {
        sentTo.push(to);
        return true;
      },
    );
    expect(sent).toBe(false);
    expect(sentTo).toEqual([]);
  });
});
