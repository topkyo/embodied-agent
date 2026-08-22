import { describe, expect, it } from "vitest";
import { SCENE_OPS_LLM_MODEL, sceneOpsLlmModel } from "./llm-model.js";

describe("sceneOpsLlmModel", () => {
  it("always returns deepseek-v4-pro for L3/L4", () => {
    expect(SCENE_OPS_LLM_MODEL).toBe("deepseek-v4-pro");
    expect(sceneOpsLlmModel()).toBe("deepseek-v4-pro");
  });
});
