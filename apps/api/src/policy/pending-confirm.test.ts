import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { IntentPayload } from "@embodied-agent/core";
import {
  clearAllPendingConfirm,
  clearPendingConfirm,
  countAllPendingConfirms,
  getPendingConfirm,
  getPendingConfirmForUser,
  isCancelText,
  isConfirmText,
  listAllPendingConfirms,
  setPendingConfirm,
} from "./pending-confirm.js";
import { resolve } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const intent: IntentPayload = {
  skill: "greenhouse.open_vent",
  target: { greenhouse_id: "gh-001" },
  parameters: { duration_seconds: 600 },
};

describe("pending-confirm", () => {
  beforeEach(() => {
    const testDir = mkdtempSync(resolve(tmpdir(), "pending-"));
    process.env.AGENT_DATA_DIR = testDir;
    clearAllPendingConfirm();
  });

  afterEach(() => {
    delete process.env.AGENT_DATA_DIR;
  });

  it("stores and retrieves pending intent", () => {
    setPendingConfirm({
      intent,
      user_id: "owner-001",
      conversation_id: "conv-1",
      model: "mock",
    });
    const row = getPendingConfirm("owner-001", "conv-1");
    expect(row?.intent.skill).toBe("greenhouse.open_vent");
  });

  it("finds pending by user when conversation differs", () => {
    setPendingConfirm({
      intent,
      user_id: "owner-001",
      conversation_id: "wx-openid-abc",
      model: "mock",
    });
    const row = getPendingConfirmForUser("owner-001");
    expect(row?.conversation_id).toBe("wx-openid-abc");
  });

  it("stores multiple proactive scenes for same conversation", () => {
    setPendingConfirm({
      intent,
      user_id: "owner-001",
      conversation_id: "wx-openid",
      model: "mock",
      scene_skill_id: "humidity_mildew_prevention",
    });
    setPendingConfirm({
      intent: {
        skill: "greenhouse.set_mode",
        target: { greenhouse_id: "gh-002" },
        parameters: { mode: "night_vent", max_temp_c: 32 },
      },
      user_id: "owner-001",
      conversation_id: "wx-openid",
      model: "mock",
      scene_skill_id: "night_ventilation_control",
    });
    expect(getPendingConfirm("owner-001", "wx-openid")).toBeUndefined();
    expect(
      getPendingConfirm("owner-001", "wx-openid", "night_ventilation_control")?.scene_skill_id,
    ).toBe("night_ventilation_control");
    expect(getPendingConfirmForUser("owner-001")).toBeUndefined();
    expect(getPendingConfirmForUser("owner-001", "night_ventilation_control")?.scene_skill_id).toBe(
      "night_ventilation_control",
    );
    clearPendingConfirm("owner-001", "wx-openid", "night_ventilation_control");
    const remaining = getPendingConfirmForUser("owner-001");
    expect(remaining?.scene_skill_id).toBe("humidity_mildew_prevention");
  });

  it("clears all pending confirms for a conversation when scene_skill_id is omitted", () => {
    setPendingConfirm({
      intent,
      user_id: "owner-001",
      conversation_id: "wx-openid",
      model: "mock",
      scene_skill_id: "humidity_mildew_prevention",
    });
    setPendingConfirm({
      intent: {
        skill: "greenhouse.set_mode",
        target: { greenhouse_id: "gh-002" },
        parameters: { mode: "night_vent", max_temp_c: 32 },
      },
      user_id: "owner-001",
      conversation_id: "wx-openid",
      model: "mock",
      scene_skill_id: "night_ventilation_control",
    });

    clearPendingConfirm("owner-001", "wx-openid");

    expect(getPendingConfirmForUser("owner-001", "humidity_mildew_prevention")).toBeUndefined();
    expect(getPendingConfirmForUser("owner-001", "night_ventilation_control")).toBeUndefined();
  });

  it("counts all pending confirms across users", () => {
    setPendingConfirm({
      intent,
      user_id: "owner-001",
      conversation_id: "conv-1",
      model: "mock",
    });
    setPendingConfirm({
      intent,
      user_id: "owner-002",
      conversation_id: "conv-2",
      model: "mock",
    });
    expect(countAllPendingConfirms()).toBe(2);
  });

  it("listAllPendingConfirms excludes expired rows", () => {
    vi.useFakeTimers({ now: 1_000_000 });
    setPendingConfirm({
      intent,
      user_id: "owner-expired",
      conversation_id: "conv-expired",
      model: "mock",
    });
    vi.advanceTimersByTime(16 * 60 * 1000);
    setPendingConfirm({
      intent,
      user_id: "owner-valid",
      conversation_id: "conv-valid",
      model: "mock",
    });
    expect(listAllPendingConfirms()).toHaveLength(1);
    expect(listAllPendingConfirms()[0]?.user_id).toBe("owner-valid");
    vi.useRealTimers();
  });

  it("detects confirm variants", () => {
    expect(isConfirmText("确认")).toBe(true);
    expect(isConfirmText("确认。")).toBe(true);
    expect(isConfirmText("「确认」")).toBe(true);
    expect(isConfirmText("好的确认")).toBe(true);
    expect(isCancelText("取消")).toBe(true);
    expect(isConfirmText("开一下")).toBe(false);
  });
});
