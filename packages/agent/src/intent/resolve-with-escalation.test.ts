import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveWithEscalation } from "./resolve-with-escalation.js";
import { bindTestAgentRuntime } from "../../test/bind-test-runtime.js";
import * as llm from "./llm.js";
import type { LlmClient } from "./llm.js";

const deploymentCtx = {
  deployment_id: "dep-gh-pilot-001",
  scene_context_sections: ["温室 ID 对照：\n- gh-002: 2号棚"],
};

function intentJson(skill: string): string {
  return JSON.stringify({
    skill,
    target: { greenhouse_id: "gh-002" },
    parameters: { duration_seconds: 900 },
    confidence: 0.95,
  });
}

function countingClient(responses: string[]): { client: LlmClient; getCalls: () => number } {
  let calls = 0;
  const client: LlmClient = {
    async completeJson() {
      calls += 1;
      return responses[calls - 1] ?? responses.at(-1)!;
    },
    async completeText() {
      calls += 1;
      return responses[calls - 1] ?? responses.at(-1)!;
    },
  };
  return { client, getCalls: () => calls };
}

describe("resolveWithEscalation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns flash result without escalation when utterance and skill align", async () => {
    const bindings = bindTestAgentRuntime({
      getEffectiveSettings: () => ({
        ...bindTestAgentRuntime().getEffectiveSettings(),
        llm_api_key: "sk-test",
      }),
    });
    const { client } = countingClient([intentJson("irrigation.start")]);

    const { result, meta } = await resolveWithEscalation(
      bindings,
      "2号棚开启灌溉15分钟",
      deploymentCtx,
      { llmClient: client, model: "deepseek-v4-flash" },
    );

    expect(result.ok).toBe(true);
    expect(meta.escalated).toBe(false);
    expect(meta.flash_skill).toBe("irrigation.start");
  });

  it("escalates to pro model when forcePro is set and api key is configured", async () => {
    const bindings = bindTestAgentRuntime({
      getEffectiveSettings: () => ({
        ...bindTestAgentRuntime().getEffectiveSettings(),
        llm_api_key: "sk-test",
        llm_base_url: "https://api.deepseek.com",
      }),
    });
    const flash = countingClient([intentJson("irrigation.start")]);
    const pro = countingClient([intentJson("irrigation.start")]);
    vi.spyOn(llm, "createFetchLlmClient").mockReturnValue(pro.client);
    const onEscalate = vi.fn();

    const { result, meta } = await resolveWithEscalation(
      bindings,
      "开启灌溉不是通风",
      deploymentCtx,
      { llmClient: flash.client, model: "deepseek-v4-flash" },
      { forcePro: true, onEscalate },
    );

    expect(result.ok).toBe(true);
    expect(meta.escalated).toBe(true);
    expect(meta.escalation_reason).toBe("user_correction");
    expect(onEscalate).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "deepseek-v4-flash",
        reason: "user_correction",
      }),
    );
    expect(llm.createFetchLlmClient).toHaveBeenCalled();
    expect(pro.getCalls()).toBeGreaterThan(0);
  });

  it("does not escalate when model is not flash tier", async () => {
    const bindings = bindTestAgentRuntime({
      getEffectiveSettings: () => ({
        ...bindTestAgentRuntime().getEffectiveSettings(),
        llm_api_key: "sk-test",
      }),
    });
    const { client } = countingClient([intentJson("greenhouse.open_vent")]);
    const createPro = vi.spyOn(llm, "createFetchLlmClient");

    const { meta } = await resolveWithEscalation(bindings, "2号棚开启灌溉15分钟", deploymentCtx, {
      llmClient: client,
      model: "deepseek-v4-pro",
    });

    expect(meta.escalated).toBe(false);
    expect(createPro).not.toHaveBeenCalled();
  });
});
