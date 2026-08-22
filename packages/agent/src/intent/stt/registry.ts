import {
  isSttConfigured,
  normalizeSttProvider,
  type SttProviderId,
  type SttSettingsSlice,
} from "../../stt-settings.js";
import { SttUnavailableError } from "../stt-errors.js";
import { aliyunNlsBackend } from "./aliyun.js";
import { iflytekIatBackend } from "./iflytek.js";
import { mockSttBackend } from "./mock.js";
import { openaiWhisperBackend } from "./openai.js";
import type { SttBackend, TranscribeInput } from "./types.js";

const BACKENDS: Record<Exclude<SttProviderId, "none">, SttBackend> = {
  openai_whisper: openaiWhisperBackend,
  aliyun: aliyunNlsBackend,
  iflytek: iflytekIatBackend,
  mock: mockSttBackend,
};

export async function transcribeWithSettings(
  input: TranscribeInput,
  settings: SttSettingsSlice,
): Promise<string> {
  const provider = normalizeSttProvider(settings.stt_provider);
  if (provider === "none" || !isSttConfigured(settings)) {
    throw new SttUnavailableError("网关未配置语音转写，请发送文字或在配置台设置 STT 提供商。");
  }
  return BACKENDS[provider].transcribe(input, settings);
}
