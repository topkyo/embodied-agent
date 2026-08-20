import { adminFetch } from "./admin-fetch.js";

export type WechatStatus = {
  connected: boolean;
  bridge_running: boolean;
  account: {
    account_id: string;
    linked_user_id?: string;
    principal_user_id?: string;
    saved_at: string;
  } | null;
};

export type WechatLoginView = {
  session_key: string;
  status: "idle" | "wait" | "scaned" | "confirmed" | "expired";
  message: string;
  qrcode_content: string | null;
  principal_user_id: string;
  domain?: string | null;
  connected?: boolean;
};

export function fetchWechatStatus(): Promise<WechatStatus> {
  return adminFetch("/admin/wechat/status");
}

export function startWechatLogin(body: {
  principal_user_id?: string;
  domain?: string;
  force?: boolean;
}): Promise<WechatLoginView & { ok: boolean }> {
  return adminFetch("/admin/wechat/login/start", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function pollWechatLogin(
  sessionKey: string,
): Promise<WechatLoginView & { ok: boolean; connected?: boolean }> {
  return adminFetch(`/admin/wechat/login/status?session_key=${encodeURIComponent(sessionKey)}`);
}

export type LangSuggest = {
  lang: "zh" | "en";
  country: string | null;
  source: string;
};

export async function suggestLang(): Promise<LangSuggest> {
  // Public endpoint, no admin token needed
  const res = await fetch("/lang-suggest");
  if (!res.ok) {
    return { lang: "zh", country: null, source: "default" };
  }
  return (await res.json()) as LangSuggest;
}
