import type { SttSettingsSlice } from "../../stt-settings.js";
import { SttUnavailableError } from "../stt-errors.js";
import { resolveSttTimeoutMs } from "./timeout.js";
import type { SttBackend, TranscribeInput } from "./types.js";

const DEFAULT_GATEWAY =
  process.env.ALIYUN_NLS_GATEWAY ?? "https://nls-gateway-cn-shanghai.aliyuncs.com";

function mapAliyunFormat(format?: string): string {
  const f = (format ?? "wav").replace(/^\./, "").toLowerCase();
  if (["pcm", "wav", "mp3", "opus", "speex", "amr"].includes(f)) return f;
  return "wav";
}

export const aliyunNlsBackend: SttBackend = {
  async transcribe(input: TranscribeInput, settings: SttSettingsSlice): Promise<string> {
    const appKey = settings.stt_app_key?.trim();
    const token = settings.stt_api_key?.trim();
    if (!appKey || !token) {
      throw new SttUnavailableError(
        "未配置阿里云 NLS：需要 stt_app_key（项目 AppKey）与 stt_api_key（NLS Token）。",
      );
    }

    const buf = Buffer.from(input.audioBase64, "base64");
    if (buf.length === 0) {
      throw new SttUnavailableError("音频数据为空。");
    }

    const format = mapAliyunFormat(input.format);
    const sampleRate = 16000;
    const url = new URL(`${DEFAULT_GATEWAY}/stream/v1/asr`);
    url.searchParams.set("appkey", appKey);
    url.searchParams.set("format", format);
    url.searchParams.set("sample_rate", String(sampleRate));
    url.searchParams.set("enable_punctuation_prediction", "true");
    url.searchParams.set("enable_inverse_text_normalization", "true");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), resolveSttTimeoutMs());
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "X-NLS-Token": token,
          "Content-Type": "application/octet-stream",
          "Content-Length": String(buf.length),
        },
        body: buf,
        signal: controller.signal,
      });
    } catch (e) {
      if (controller.signal.aborted) {
        throw new SttUnavailableError("阿里云 STT 请求超时");
      }
      throw new SttUnavailableError(e instanceof Error ? e.message : "阿里云 STT 请求失败");
    } finally {
      clearTimeout(timer);
    }

    const raw = await res.text();
    if (!res.ok) {
      throw new SttUnavailableError(`阿里云 STT HTTP ${res.status}`);
    }

    let text: string;
    try {
      const json = JSON.parse(raw) as {
        result?: string;
        payload?: { result?: string };
      };
      text = (json.result ?? json.payload?.result ?? "").trim();
    } catch {
      text = raw.trim();
    }
    if (!text) throw new SttUnavailableError("STT 返回空文本");
    return text;
  },
};
