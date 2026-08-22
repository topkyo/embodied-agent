const LLM_PATCH_KEYS = new Set([
  "llm_provider",
  "llm_base_url",
  "llm_model",
  "llm_thinking",
  "llm_api_key",
  "stt_provider",
  "stt_model",
  "stt_api_key",
  "stt_app_key",
  "stt_app_id",
]);

/** 仅当 PATCH 含 LLM/STT 字段时返回 LLM 重启提示；场景字段保存由前端用通用文案。 */
export function settingsSaveNote(patch: Record<string, unknown>): string | undefined {
  const touchedLlm = Object.keys(patch).some((k) => LLM_PATCH_KEYS.has(k));
  if (!touchedLlm) return undefined;
  return "LLM 配置已保存。若对话仍异常，请重启 API 进程。";
}
