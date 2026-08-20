import { randomBytes, randomUUID } from "node:crypto";

/**
 * Node.js 原生 fetch（undici）不自动读取 HTTP_PROXY/HTTPS_PROXY 环境变量。
 * 当系统配置了代理时（如 socks5h://127.0.0.1:7890），需要显式注入 ProxyAgent。
 */
let dispatcher: import("undici").Dispatcher | null = null;

async function ensureDispatcher(): Promise<void> {
  if (dispatcher) return;
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy;
  if (!proxyUrl) return;
  try {
    const { ProxyAgent } = await import("undici");
    dispatcher = new ProxyAgent({ uri: proxyUrl });
  } catch (e) {
    // 代理环境变量已设置但 undici 不可用——不静默兜底，明确报错让调用方可见。
    throw new Error(
      `HTTPS_PROXY is set (${proxyUrl}) but undici ProxyAgent import failed: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
}

async function proxyFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  await ensureDispatcher();
  if (dispatcher) {
    const { fetch: undiciFetch } = await import("undici");
    return undiciFetch(url, {
      ...(init as Record<string, unknown>),
      dispatcher,
    }) as unknown as Promise<Response>;
  }
  return fetch(url, init);
}

export const ILINK_DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
export const ILINK_BOT_TYPE = "3";

/** 测试 / E2E mock 可设 ILINK_BASE_URL 覆盖默认 iLink 端点。 */
export function resolveIlinkBaseUrl(): string {
  const override = process.env.ILINK_BASE_URL?.trim();
  return override || ILINK_DEFAULT_BASE_URL;
}

export type QrStartResponse = {
  ret?: number;
  qrcode: string;
  qrcode_img_content: string;
};

export type QrStatus = "wait" | "scaned" | "confirmed" | "expired";

export type QrStatusResponse = {
  status: QrStatus;
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
  ret?: number;
};

export type WeixinMessage = {
  from_user_id?: string;
  to_user_id?: string;
  message_type?: number;
  message_state?: number;
  context_token?: string;
  item_list?: Array<{
    type?: number;
    text_item?: { text?: string };
    voice_item?: { text?: string };
  }>;
};

export type GetUpdatesResponse = {
  ret?: number;
  errcode?: number;
  msgs?: WeixinMessage[];
  get_updates_buf?: string;
  longpolling_timeout_ms?: number;
};

function randomWechatUin(): string {
  const uint32 = randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}

function apiBase(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

export async function fetchBotQrcode(
  baseUrl = resolveIlinkBaseUrl(),
  botType = ILINK_BOT_TYPE,
): Promise<QrStartResponse> {
  const url = new URL(
    `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(botType)}`,
    apiBase(baseUrl),
  );
  const res = await proxyFetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`get_bot_qrcode failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as QrStartResponse;
  if (!data.qrcode || !data.qrcode_img_content) {
    throw new Error("get_bot_qrcode: missing qrcode fields");
  }
  return data;
}

export async function pollQrcodeStatus(
  qrcode: string,
  baseUrl = resolveIlinkBaseUrl(),
  timeoutMs = 8_000,
): Promise<QrStatusResponse> {
  const url = new URL(
    `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
    apiBase(baseUrl),
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await proxyFetch(url, {
      headers: { "iLink-App-ClientVersion": "1" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`get_qrcode_status failed: ${res.status} ${body}`);
    }
    return (await res.json()) as QrStatusResponse;
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      return { status: "wait" };
    }
    throw e;
  }
}

function buildAuthHeaders(token: string | undefined, body: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    "Content-Length": String(Buffer.byteLength(body, "utf-8")),
    "X-WECHAT-UIN": randomWechatUin(),
  };
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

export async function getUpdates(params: {
  baseUrl: string;
  token: string;
  get_updates_buf: string;
  timeoutMs?: number;
}): Promise<GetUpdatesResponse> {
  const body = JSON.stringify({
    get_updates_buf: params.get_updates_buf ?? "",
    base_info: { channel_version: "embodied-agent-1" },
  });
  const url = new URL("ilink/bot/getupdates", apiBase(params.baseUrl));
  const controller = new AbortController();
  const timeout = params.timeoutMs ?? 35_000;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await proxyFetch(url, {
      method: "POST",
      headers: buildAuthHeaders(params.token, body),
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`getupdates failed: ${res.status} ${raw}`);
    }
    return JSON.parse(raw) as GetUpdatesResponse;
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      return { ret: 0, msgs: [], get_updates_buf: params.get_updates_buf };
    }
    throw e;
  }
}

export async function sendTextMessage(params: {
  baseUrl: string;
  token: string;
  toUserId: string;
  text: string;
  contextToken: string;
}): Promise<void> {
  const clientId = `df-${randomUUID()}`;
  const body = JSON.stringify({
    msg: {
      from_user_id: "",
      to_user_id: params.toUserId,
      client_id: clientId,
      message_type: 2,
      message_state: 2,
      context_token: params.contextToken,
      item_list: [{ type: 1, text_item: { text: params.text } }],
    },
    base_info: { channel_version: "embodied-agent-1" },
  });
  const url = new URL("ilink/bot/sendmessage", apiBase(params.baseUrl));
  const res = await proxyFetch(url, {
    method: "POST",
    headers: buildAuthHeaders(params.token, body),
    body,
  });
  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`sendmessage failed: ${res.status} ${raw}`);
  }
  try {
    const parsed = JSON.parse(raw) as { ret?: number; errcode?: number; errmsg?: string };
    const bad =
      (parsed.ret !== undefined && parsed.ret !== 0) ||
      (parsed.errcode !== undefined && parsed.errcode !== 0);
    if (bad) {
      throw new Error(
        `sendmessage ret=${parsed.ret ?? "?"} errcode=${parsed.errcode ?? "?"} ${parsed.errmsg ?? raw}`,
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("sendmessage")) throw e;
    // 非 JSON 响应且 HTTP 200 时视为成功
  }
}

export function extractInboundText(msg: WeixinMessage): string {
  for (const item of msg.item_list ?? []) {
    if (item.type === 1 && item.text_item?.text) {
      return String(item.text_item.text).trim();
    }
    // 语音：优先微信/iLink 自带转写（无需网关 STT）
    if (item.type === 3) {
      const voiceText = item.voice_item?.text ?? item.text_item?.text;
      if (voiceText) return String(voiceText).trim();
    }
  }
  return "";
}

export function inboundHasVoice(msg: WeixinMessage): boolean {
  return (msg.item_list ?? []).some((item) => item.type === 3);
}
