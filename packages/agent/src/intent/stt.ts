import type { AgentRuntimeBindings } from "../runtime-bindings.js";
import { isSttConfigured } from "../stt-settings.js";
import { SttUnavailableError } from "./stt-errors.js";
import { transcribeWithSettings } from "./stt/registry.js";
import { LlmUnavailableError } from "./llm.js";

export { SttUnavailableError } from "./stt-errors.js";

export async function transcribeAudioBase64(
  bindings: AgentRuntimeBindings,
  opts: {
    audioBase64: string;
    format?: string;
    language?: string;
  },
): Promise<string> {
  const s = bindings.getEffectiveSettings();
  return transcribeWithSettings(
    {
      audioBase64: opts.audioBase64,
      format: opts.format,
      language: opts.language,
    },
    s,
  );
}

export async function resolveUtteranceText(
  bindings: AgentRuntimeBindings,
  input: {
    text?: string;
    audio_base64?: string;
    audio_format?: string;
  },
): Promise<{ text: string; from_stt: boolean }> {
  const trimmed = input.text?.trim() ?? "";
  if (input.audio_base64?.trim()) {
    const s = bindings.getEffectiveSettings();
    if (!isSttConfigured(s)) {
      throw new SttUnavailableError("网关未配置语音转写，请发送文字或在配置台设置 STT 提供商。");
    }
    const transcript = await transcribeAudioBase64(bindings, {
      audioBase64: input.audio_base64.trim(),
      format: input.audio_format,
      language: "zh",
    });
    const merged = trimmed ? `${trimmed} ${transcript}`.trim() : transcript;
    return { text: merged, from_stt: true };
  }
  if (!trimmed) {
    throw new LlmUnavailableError("需要 text 或 audio_base64。");
  }
  return { text: trimmed, from_stt: false };
}
