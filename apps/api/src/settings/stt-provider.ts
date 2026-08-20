export type SttProviderId = "none" | "openai_whisper" | "aliyun" | "iflytek" | "mock";

export function normalizeSttProvider(raw?: string): SttProviderId {
  const value = raw?.trim();
  if (!value) return "none";
  switch (value) {
    case "openai_whisper":
    case "aliyun":
    case "iflytek":
    case "mock":
      return value;
    case "none":
      return "none";
    default:
      throw new Error(`未知 STT_PROVIDER：${raw}`);
  }
}

export type SttSettingsSlice = {
  stt_provider: SttProviderId;
  stt_model: string;
  stt_api_key?: string;
  stt_app_key?: string;
  stt_app_id?: string;
  llm_provider: "deepseek" | "openai";
  llm_api_key?: string;
  llm_base_url: string;
};

export function isSttConfigured(s: SttSettingsSlice): boolean {
  switch (s.stt_provider) {
    case "mock":
      return process.env.STT_MOCK === "1";
    case "openai_whisper":
      return Boolean(s.stt_api_key?.trim() || s.llm_api_key?.trim());
    case "aliyun":
      return Boolean(s.stt_app_key?.trim() && s.stt_api_key?.trim());
    case "iflytek":
      return Boolean(s.stt_app_id?.trim() && s.stt_api_key?.trim());
    default:
      return false;
  }
}
