import type { SttSettingsSlice } from "../../stt-settings.js";
import { SttUnavailableError } from "../stt-errors.js";
import { resolveSttTimeoutMs } from "./timeout.js";
import type { SttBackend, TranscribeInput } from "./types.js";

export const openaiWhisperBackend: SttBackend = {
  async transcribe(input: TranscribeInput, settings: SttSettingsSlice): Promise<string> {
    const apiKey = settings.stt_api_key?.trim() || settings.llm_api_key?.trim();
    if (!apiKey) {
      throw new SttUnavailableError("未配置 OpenAI API Key，无法转写语音。");
    }

    const baseUrl = settings.llm_base_url.replace(/\/$/, "");
    const buf = Buffer.from(input.audioBase64, "base64");
    if (buf.length === 0) {
      throw new SttUnavailableError("音频数据为空。");
    }
    const ext = (input.format ?? "wav").replace(/^\./, "");
    const form = new FormData();
    form.append("file", new Blob([buf]), `utterance.${ext}`);
    form.append("model", settings.stt_model);
    if (input.language) form.append("language", input.language);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), resolveSttTimeoutMs());
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      });
    } catch (e) {
      if (controller.signal.aborted) {
        throw new SttUnavailableError("OpenAI STT 请求超时");
      }
      throw new SttUnavailableError(e instanceof Error ? e.message : "OpenAI STT 请求失败");
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      throw new SttUnavailableError(`STT HTTP ${res.status}`);
    }
    const payload = (await res.json()) as { text?: string };
    const text = payload.text?.trim();
    if (!text) throw new SttUnavailableError("STT 返回空文本");
    return text;
  },
};
