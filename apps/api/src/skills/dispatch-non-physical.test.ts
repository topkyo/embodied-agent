import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import type { IntentPayload } from "@embodied-agent/core";

vi.mock("./handlers/index.js", () => ({
  executeSkill: vi.fn(),
}));

const { executeSkill } = await import("./handlers/index.js");
const { dispatchNonPhysicalSkill } = await import("./dispatch-non-physical.js");

let testDir: string;

beforeEach(() => {
  testDir = allocateAgentDataDir("dispatch-non-physical");
  vi.mocked(executeSkill).mockReset();
});

afterEach(() => {
  releaseAgentDataDir(testDir);
});

function makeIntent(skill = "weather.query_forecast"): IntentPayload {
  return {
    skill,
    target: {},
    parameters: { hours: 6 },
    confidence: 0.9,
  } as IntentPayload;
}

describe("dispatchNonPhysicalSkill", () => {
  it("returns reply with status 200 on successful skill execution", async () => {
    vi.mocked(executeSkill).mockResolvedValue({
      reply: "今日天气晴朗",
      params: { deployment_id: "dep-gh-pilot-001" },
    });

    const result = await dispatchNonPhysicalSkill(makeIntent(), {
      user_id: "owner-001",
      model: "deepseek-v4-flash",
    });

    expect(result.status).toBe(200);
    expect(result.reply).toBe("今日天气晴朗");
    expect(executeSkill).toHaveBeenCalledOnce();
  });

  it("passes user_id to executeSkill context", async () => {
    vi.mocked(executeSkill).mockResolvedValue({
      reply: "ok",
      params: {},
    });

    await dispatchNonPhysicalSkill(makeIntent("irrigation.query_status"), {
      user_id: "user-abc",
      model: "deepseek-v4-flash",
    });

    expect(executeSkill).toHaveBeenCalledWith(
      expect.objectContaining({ skill: "irrigation.query_status" }),
      { user_id: "user-abc" },
    );
  });

  it("returns status 503 with fallback reply on skill error", async () => {
    vi.mocked(executeSkill).mockRejectedValue(new Error("下游服务不可用"));

    const result = await dispatchNonPhysicalSkill(makeIntent(), {
      user_id: "owner-001",
      model: "deepseek-v4-flash",
    });

    expect(result.status).toBe(503);
    expect(result.reply).toBe("技能执行失败，请稍后重试。");
  });

  it("returns status 503 on non-Error rejection", async () => {
    vi.mocked(executeSkill).mockRejectedValue("string error");

    const result = await dispatchNonPhysicalSkill(makeIntent(), {
      user_id: "owner-001",
      model: "deepseek-v4-flash",
    });

    expect(result.status).toBe(503);
    expect(result.reply).toBe("技能执行失败，请稍后重试。");
  });

  it("propagates skill name in executeSkill call", async () => {
    vi.mocked(executeSkill).mockResolvedValue({
      reply: "ok",
      params: {},
    });

    await dispatchNonPhysicalSkill(makeIntent("weather.query_forecast"), {
      user_id: "owner-001",
      model: "deepseek-v4-flash",
    });

    expect(executeSkill).toHaveBeenCalledWith(
      expect.objectContaining({ skill: "weather.query_forecast" }),
      expect.any(Object),
    );
  });
});
