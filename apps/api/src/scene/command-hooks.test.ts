import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { CommandRecord } from "../commands/types.js";
import {
  clearCommandHooksFlywheelDedup,
  clearCommandHooksStateForTests,
  onCommandTerminalEvent,
} from "./command-hooks.js";
import { upsertBinding } from "../auth/platform-bind.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import { seedDefaultUsers } from "../test/users-fixture.js";
import { saveWechatAccount } from "../wechat/ilink-store.js";
import { countRecentDeviceFailures } from "./device-failures.js";
import { clearCommands, createCommand, markCommandFailed } from "../commands/store.js";
import { clearNotificationPrefs, suppressL2ForTonight } from "../policy/notification-prefs.js";
import { clearAllPendingConfirm, getPendingConfirmForUser } from "../policy/pending-confirm.js";
import { listOperationLogs } from "../db/log.js";
import type { CommandMessage } from "@embodied-agent/core";

/** greenhouse 场景调参：与 scenes/greenhouse/scene/command-hooks.ts 的阈值保持一致。 */
const DEVICE_FAILURE_NOTIFY_THRESHOLD = 3;

let testDir: string;

const sendMock = vi.fn(async (_id: string, _msg: string) => true);

vi.mock("../channels/proactive-send.js", () => ({
  defaultProactiveSend: (platformUserId: string, message: string) =>
    sendMock(platformUserId, message),
}));

function irrigationCompletedRecord(): CommandRecord {
  const now = new Date().toISOString();
  return {
    command_id: "cmd-irr-1",
    status: "completed",
    created_at: now,
    updated_at: now,
    command: {
      message_type: "command",
      protocol_version: "0.1",
      command_id: "cmd-irr-1",
      idempotency_key: "k",
      deployment_id: "dep-gh-pilot-001",
      node_id: "node-sim-gh-001",
      device_id: "irrigation-sim-gh-001",
      device_type: "irrigation_valve",
      action: "start",
      parameters: { duration_seconds: 300 },
      issued_by: {
        user_id: "owner-001",
        role: "owner",
        platform: "wechat",
        conversation_id: "wx-1",
      },
      created_at: now,
      expires_at: now,
    },
  };
}

describe("command-hooks", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    seedCanonicalSimRegistry();
    seedDefaultUsers();
    clearCommands("dep-gh-pilot-001");
    upsertBinding("wechat", "wx-owner", "owner-001");
    saveWechatAccount({
      account_id: "wx-test",
      base_url: "http://127.0.0.1",
      token: "tok",
      saved_at: new Date().toISOString(),
    });
    sendMock.mockReset();
    sendMock.mockResolvedValue(true);
    clearNotificationPrefs();
    clearCommandHooksStateForTests();
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("notifies device efficiency once when failures reach threshold", async () => {
    const now = new Date().toISOString();
    const template: CommandMessage = {
      message_type: "command",
      protocol_version: "0.1",
      command_id: "cmd-fail-base",
      idempotency_key: "k0",
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

    for (let i = 0; i < DEVICE_FAILURE_NOTIFY_THRESHOLD - 1; i++) {
      const id = `cmd-fail-${i}`;
      createCommand({ ...template, command_id: id, idempotency_key: `k${i}` });
      markCommandFailed(id, { code: "mqtt_unavailable", message: "down" });
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(sendMock).not.toHaveBeenCalled();

    const lastId = `cmd-fail-${DEVICE_FAILURE_NOTIFY_THRESHOLD - 1}`;
    createCommand({
      ...template,
      command_id: lastId,
      idempotency_key: "k-last",
    });
    markCommandFailed(lastId, { code: "mqtt_unavailable", message: "down" });
    expect(countRecentDeviceFailures("vent-sim-gh-001", "dep-gh-pilot-001")).toBe(
      DEVICE_FAILURE_NOTIFY_THRESHOLD,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(sendMock).toHaveBeenCalledTimes(1);
    const opLog = listOperationLogs().find(
      (row) => row.params.scene_skill_id === "device_efficiency_diagnosis" && row.result === "sent",
    );
    expect(opLog?.params.device_id).toBe("vent-sim-gh-001");

    sendMock.mockClear();
    const extraId = "cmd-fail-extra";
    createCommand({
      ...template,
      command_id: extraId,
      idempotency_key: "k-extra",
    });
    markCommandFailed(extraId, { code: "mqtt_unavailable", message: "down" });
    await new Promise((r) => setTimeout(r, 50));
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("clearCommandHooksFlywheelDedup allows device efficiency notify again", async () => {
    const now = new Date().toISOString();
    const template: CommandMessage = {
      message_type: "command",
      protocol_version: "0.1",
      command_id: "cmd-fail-base",
      idempotency_key: "k0",
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

    for (let i = 0; i < DEVICE_FAILURE_NOTIFY_THRESHOLD; i++) {
      const id = `cmd-round1-${i}`;
      createCommand({ ...template, command_id: id, idempotency_key: `r1-${i}` });
      markCommandFailed(id, { code: "mqtt_unavailable", message: "down" });
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(sendMock).toHaveBeenCalledTimes(1);

    sendMock.mockClear();
    clearCommandHooksFlywheelDedup();
    for (let i = 0; i < DEVICE_FAILURE_NOTIFY_THRESHOLD; i++) {
      const id = `cmd-round2-${i}`;
      createCommand({ ...template, command_id: id, idempotency_key: `r2-${i}` });
      markCommandFailed(id, { code: "mqtt_unavailable", message: "down" });
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("skips post-irrigation when L2 suppressed for user", async () => {
    clearAllPendingConfirm();
    suppressL2ForTonight("owner-001");
    onCommandTerminalEvent(irrigationCompletedRecord());
    await new Promise((r) => setTimeout(r, 30));
    expect(sendMock).not.toHaveBeenCalled();
    expect(getPendingConfirmForUser("owner-001")).toBeUndefined();
  });

  it("sends post-irrigation under FLYWHEEL_DEV without wechat token", async () => {
    process.env.FLYWHEEL_DEV = "1";
    process.env.NODE_ENV = "test";
    const { rmSync: rmWechat } = await import("node:fs");
    const wechatPath = resolve(testDir, "wechat-ilink-accounts.json");
    if (existsSync(wechatPath)) rmWechat(wechatPath);
    clearAllPendingConfirm();
    onCommandTerminalEvent(irrigationCompletedRecord());
    await new Promise((r) => setTimeout(r, 50));
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(getPendingConfirmForUser("owner-001")?.scene_skill_id).toBe(
      "post_irrigation_ventilation",
    );
    delete process.env.FLYWHEEL_DEV;
    delete process.env.NODE_ENV;
  });

  it("dedupes post-irrigation suggestion per command_id after successful send", async () => {
    const record = irrigationCompletedRecord();
    onCommandTerminalEvent(record);
    onCommandTerminalEvent(record);
    await new Promise((r) => setTimeout(r, 30));
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("retries device efficiency notify when send fails then succeeds", async () => {
    const now = new Date().toISOString();
    const template: CommandMessage = {
      message_type: "command",
      protocol_version: "0.1",
      command_id: "cmd-fail-base",
      idempotency_key: "k0",
      deployment_id: "dep-gh-pilot-001",
      node_id: "node-sim-gh-001",
      device_id: "vent-sim-gh-002",
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

    for (let i = 0; i < DEVICE_FAILURE_NOTIFY_THRESHOLD - 1; i++) {
      const id = `cmd-eff-retry-${i}`;
      createCommand({ ...template, command_id: id, idempotency_key: `kr${i}` });
      markCommandFailed(id, { code: "mqtt_unavailable", message: "down" });
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(sendMock).not.toHaveBeenCalled();

    sendMock.mockResolvedValueOnce(false);
    const thirdId = "cmd-eff-retry-2";
    createCommand({
      ...template,
      command_id: thirdId,
      idempotency_key: "kr2",
    });
    markCommandFailed(thirdId, { code: "mqtt_unavailable", message: "down" });
    await new Promise((r) => setTimeout(r, 50));
    expect(sendMock).toHaveBeenCalledTimes(1);

    sendMock.mockResolvedValueOnce(true);
    const fourthId = "cmd-eff-retry-3";
    createCommand({
      ...template,
      command_id: fourthId,
      idempotency_key: "kr3",
    });
    markCommandFailed(fourthId, { code: "mqtt_unavailable", message: "down" });
    await new Promise((r) => setTimeout(r, 50));
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("retries post-irrigation when send fails then succeeds", async () => {
    sendMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const record = irrigationCompletedRecord();
    onCommandTerminalEvent(record);
    await new Promise((r) => setTimeout(r, 30));
    expect(sendMock).toHaveBeenCalledTimes(1);

    onCommandTerminalEvent(record);
    await new Promise((r) => setTimeout(r, 30));
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});
