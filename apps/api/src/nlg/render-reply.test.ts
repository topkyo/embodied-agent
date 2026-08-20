import { beforeEach, describe, expect, it, vi } from "vitest";

const sceneOpsCompleteText = vi.fn(async () => "proactive summary");
const sceneOpsLastUsage = vi.fn(() => ({
  prompt_tokens: 100,
  completion_tokens: 20,
  total_tokens: 120,
}));
const sceneOpsResetUsage = vi.fn();
const flashCompleteText = vi.fn(async () => "flash reply");

vi.mock("../scene/llm-model.js", () => ({
  createSceneOpsLlmClient: vi.fn(() => ({
    completeText: sceneOpsCompleteText,
    lastUsage: sceneOpsLastUsage,
    resetUsage: sceneOpsResetUsage,
  })),
  sceneOpsLlmModel: vi.fn(() => "deepseek-v4-pro"),
}));

const flashLastUsage = vi.fn(() => ({
  prompt_tokens: 42,
  completion_tokens: 7,
  total_tokens: 49,
}));
const flashResetUsage = vi.fn();

vi.mock("@embodied-agent/agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@embodied-agent/agent")>();
  return {
    ...actual,
    createFetchLlmClient: vi.fn((opts: { model?: string }) => ({
      completeText: flashCompleteText,
      lastUsage: flashLastUsage,
      resetUsage: flashResetUsage,
      model: opts?.model,
    })),
    isFlashTierModel: (model: string) => model.includes("flash"),
  };
});

vi.mock("../settings/store.js", () => ({
  getEffectiveSettings: vi.fn(() => ({
    llm_api_key: "test-key",
    llm_base_url: "https://api.test",
    llm_model: "deepseek-v4-flash",
    llm_thinking: true,
    nlg_enabled: true,
    active_domain: "agriculture",
  })),
  clearEffectiveSettingsCacheForTest: vi.fn(),
}));

import { createFetchLlmClient } from "@embodied-agent/agent";
import { createSceneOpsLlmClient } from "../scene/llm-model.js";
import {
  clearNlgCache,
  isNlgEligibleSkill,
  isNlgEnabled,
  renderProactiveSummary,
  renderReply,
} from "./render-reply.js";
import { getEffectiveSettings } from "../settings/store.js";
import { clearNlgLogs, getNlgLogs } from "./observability.js";

describe("render-reply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearNlgLogs();
  });

  it("marks query skills as NLG eligible", () => {
    expect(isNlgEligibleSkill("weather.query_forecast")).toBe(true);
    expect(isNlgEligibleSkill("greenhouse.open_vent")).toBe(false);
  });

  it("excludes advice.query_weekly from NLG (Pro only in buildWeeklyAdviceText)", () => {
    expect(isNlgEligibleSkill("advice.query_weekly")).toBe(false);
  });

  it("renderReply skips Flash NLG by default", async () => {
    const reply = await renderReply({
      skill: "weather.query_forecast",
      templateReply: "明天晴",
      userText: "明天天气怎么样",
    });

    expect(reply).toBe("明天晴");
    expect(flashCompleteText).not.toHaveBeenCalled();
  });

  it("renderReply cache keys include userText and skip when history present", async () => {
    vi.mocked(getEffectiveSettings).mockReturnValue({
      llm_api_key: "test-key",
      llm_base_url: "https://api.test",
      llm_model: "deepseek-v4-pro",
      llm_thinking: true,
      nlg_enabled: true,
      nlg_flash_enabled: true,
      active_domain: "agriculture",
    } as ReturnType<typeof getEffectiveSettings>);
    clearNlgCache();
    flashCompleteText
      .mockResolvedValueOnce("一号棚 28 度")
      .mockResolvedValueOnce("一号棚 28 度，有点热")
      .mockResolvedValueOnce("结合历史的一号棚 28 度");

    const first = await renderReply({
      skill: "greenhouse.query_status",
      templateReply: "gh-001 28°C",
      userText: "1号棚多少度",
    });
    const second = await renderReply({
      skill: "greenhouse.query_status",
      templateReply: "gh-001 28°C",
      userText: "1号棚热吗",
    });
    const withHistory = await renderReply({
      skill: "greenhouse.query_status",
      templateReply: "gh-001 28°C",
      userText: "1号棚多少度",
      history: [{ role: "user", content: "刚才呢" }],
    });

    expect(first).toBe("一号棚 28 度");
    expect(second).toBe("一号棚 28 度，有点热");
    expect(withHistory).toBe("结合历史的一号棚 28 度");
    expect(flashCompleteText).toHaveBeenCalledTimes(3);
    expect(isNlgEnabled()).toBe(true);
  });

  it("records NLG token usage for query and proactive summary", async () => {
    vi.mocked(getEffectiveSettings).mockReturnValue({
      llm_api_key: "test-key",
      llm_base_url: "https://api.test",
      llm_model: "deepseek-v4-pro",
      llm_thinking: true,
      nlg_enabled: true,
      nlg_flash_enabled: true,
      active_domain: "agriculture",
    } as ReturnType<typeof getEffectiveSettings>);

    await renderReply({
      skill: "weather.query_forecast",
      templateReply: "明天晴",
      userText: "明天天气怎么样",
    });
    await renderProactiveSummary({
      kind: "sustained_alert",
      templateText: "2号棚 32°C 持续超温",
    });

    expect(flashResetUsage).toHaveBeenCalled();
    expect(flashLastUsage).toHaveBeenCalled();
    expect(sceneOpsResetUsage).toHaveBeenCalled();
    expect(sceneOpsLastUsage).toHaveBeenCalled();

    const queryLog = getNlgLogs().find((row) => row.kind === "query");
    expect(queryLog).toMatchObject({
      model: "deepseek-v4-pro",
      skill: "weather.query_forecast",
      prompt_tokens: 42,
      completion_tokens: 7,
      total_tokens: 49,
    });

    const proactiveLog = getNlgLogs().find((row) => row.kind === "proactive_summary");
    expect(proactiveLog).toMatchObject({
      model: "deepseek-v4-pro",
      proactive_kind: "sustained_alert",
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
    });
  });

  it("renderProactiveSummary uses Scene Ops Pro client", async () => {
    const reply = await renderProactiveSummary({
      kind: "sustained_alert",
      templateText: "2号棚 32°C 持续超温",
    });

    expect(reply).toBe("proactive summary");
    expect(createSceneOpsLlmClient).toHaveBeenCalled();
    expect(createFetchLlmClient).not.toHaveBeenCalled();
    expect(sceneOpsCompleteText).toHaveBeenCalled();
  });
});
