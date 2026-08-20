export type LlmProvider = "deepseek" | "openai";

export const PROVIDER_PRESETS: Record<
  LlmProvider,
  { llm_base_url: string; llm_model: string; stt_model: string; llm_thinking: boolean }
> = {
  deepseek: {
    llm_base_url: "https://api.deepseek.com/v1",
    llm_model: "deepseek-v4-flash",
    stt_model: "whisper-1",
    llm_thinking: true,
  },
  openai: {
    llm_base_url: "https://api.openai.com/v1",
    llm_model: "gpt-4o",
    stt_model: "whisper-1",
    llm_thinking: true,
  },
};

export function normalizeProvider(raw?: string): LlmProvider {
  const value = raw?.trim();
  if (!value) return "deepseek";
  if (value === "openai" || value === "deepseek") return value;
  throw new Error(`未知 LLM_PROVIDER：${raw}`);
}
