import { getEffectiveSettings } from "../settings/store.js";
import { createFetchLlmClient, type LlmClient } from "@embodied-agent/agent";

/** L3 场景建议 / L4 运营复盘固定使用 Pro（复杂 JSON 上下文 + 多源运营数据）。 */
export const SCENE_OPS_LLM_MODEL = "deepseek-v4-pro";

export function sceneOpsLlmModel(): string {
  return SCENE_OPS_LLM_MODEL;
}

export function createSceneOpsLlmClient(settings = getEffectiveSettings()): LlmClient {
  return createFetchLlmClient({
    apiKey: settings.llm_api_key,
    baseUrl: settings.llm_base_url,
    model: sceneOpsLlmModel(),
    thinking: settings.llm_thinking,
    timeoutMs: 30_000,
  });
}
