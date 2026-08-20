import type { SttSettingsSlice } from "../../stt-settings.js";
import { SttUnavailableError } from "../stt-errors.js";
import { buildIflytekWsUrl } from "./iflytek-auth.js";
import { resolveSttTimeoutMs } from "./timeout.js";
import type { SttBackend, TranscribeInput } from "./types.js";

const HOST = "iat-api.xfyun.cn";
const PATH = "/v2/iat";

function audioPayload(buf: Buffer, format?: string): { encoding: string; audio: string } {
  const f = (format ?? "wav").replace(/^\./, "").toLowerCase();
  if (f === "wav" && buf.length > 44 && buf.toString("ascii", 0, 4) === "RIFF") {
    return {
      encoding: "raw",
      audio: buf.subarray(44).toString("base64"),
    };
  }
  if (f === "pcm") {
    return { encoding: "raw", audio: buf.toString("base64") };
  }
  return {
    encoding: "lame",
    audio: buf.toString("base64"),
  };
}

function getWebSocketCtor(): typeof WebSocket {
  if (typeof globalThis.WebSocket !== "undefined") {
    return globalThis.WebSocket;
  }
  throw new SttUnavailableError(
    "当前 Node 运行时不支持 WebSocket，无法使用讯飞 STT。请升级 Node 或改用阿里云/OpenAI。",
  );
}

export const iflytekIatBackend: SttBackend = {
  async transcribe(input: TranscribeInput, settings: SttSettingsSlice): Promise<string> {
    const appId = settings.stt_app_id?.trim();
    const apiSecret = settings.stt_api_key?.trim();
    const apiKey = settings.stt_app_key?.trim() || appId;
    if (!appId || !apiSecret || !apiKey) {
      throw new SttUnavailableError(
        "未配置讯飞：需要 stt_app_id、stt_api_key（API Secret），以及 stt_app_key（API Key，可同 app_id）。",
      );
    }

    const buf = Buffer.from(input.audioBase64, "base64");
    if (buf.length === 0) {
      throw new SttUnavailableError("音频数据为空。");
    }

    const { encoding, audio } = audioPayload(buf, input.format);
    const wsUrl = buildIflytekWsUrl({
      host: HOST,
      path: PATH,
      apiKey,
      apiSecret,
    });

    const WebSocketImpl = getWebSocketCtor();
    const transcripts: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocketImpl(wsUrl);
      let settled = false;
      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(
          err instanceof SttUnavailableError
            ? err
            : new SttUnavailableError(err instanceof Error ? err.message : "讯飞 STT 连接失败"),
        );
      };
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      // 对端静默挂起时 error/close 均不触发，必须有超时兜底，否则 Promise 永不 settle。
      const timer = setTimeout(() => {
        fail(new SttUnavailableError("讯飞 STT 请求超时"));
      }, resolveSttTimeoutMs());

      ws.addEventListener("error", () => fail(new SttUnavailableError("讯飞 STT 连接错误")));
      ws.addEventListener("message", (ev) => {
        try {
          const data = JSON.parse(String(ev.data)) as {
            code?: number;
            message?: string;
            data?: { result?: { ws?: { cw?: { w?: string }[] }[] } };
          };
          if (data.code !== 0 && data.code !== undefined) {
            fail(new SttUnavailableError(data.message ?? `讯飞 STT 错误 ${data.code}`));
            return;
          }
          const wsResult = data.data?.result?.ws ?? [];
          for (const part of wsResult) {
            for (const cw of part.cw ?? []) {
              if (cw.w) transcripts.push(cw.w);
            }
          }
        } catch {
          /* ignore malformed frames */
        }
      });

      ws.addEventListener("open", () => {
        const first = {
          common: { app_id: appId },
          business: {
            language: "zh_cn",
            domain: "iat",
            accent: "mandarin",
            vad_eos: 2000,
          },
          data: {
            status: 0,
            format: encoding === "raw" ? "audio/L16;rate=16000" : "audio/mp3",
            encoding,
            audio: "",
          },
        };
        ws.send(JSON.stringify(first));

        const chunk = {
          data: {
            status: 1,
            format: encoding === "raw" ? "audio/L16;rate=16000" : "audio/mp3",
            encoding,
            audio,
          },
        };
        ws.send(JSON.stringify(chunk));

        const last = {
          data: {
            status: 2,
            format: encoding === "raw" ? "audio/L16;rate=16000" : "audio/mp3",
            encoding,
            audio: "",
          },
        };
        ws.send(JSON.stringify(last));
      });

      ws.addEventListener("close", () => done());
    });

    const text = transcripts.join("").trim();
    if (!text) throw new SttUnavailableError("STT 返回空文本");
    return text;
  },
};
