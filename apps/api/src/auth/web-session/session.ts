import type { WebAccount, WebSessionRecord, WebSessionView } from "./types.js";
import { ephemeralDel, ephemeralGetJson, ephemeralSetJson } from "./ephemeral-store.js";
import { buildSessionCookieValue, newSessionId, sessionTtlSeconds } from "./cookie.js";

const NS = "web-session";

export async function createWebSession(account: WebAccount): Promise<{
  session: WebSessionRecord;
  cookieValue: string;
}> {
  const now = Date.now();
  const ttl = sessionTtlSeconds();
  const session: WebSessionRecord = {
    session_id: newSessionId(),
    user_id: account.user_id,
    role: account.role,
    display_name: account.display_name,
    created_at: now,
    expires_at: now + ttl * 1000,
  };
  await ephemeralSetJson(NS, session.session_id, session, ttl);
  return {
    session,
    cookieValue: buildSessionCookieValue(session.session_id),
  };
}

export async function loadWebSession(sessionId: string): Promise<WebSessionRecord | null> {
  const row = await ephemeralGetJson<WebSessionRecord>(NS, sessionId);
  if (!row) return null;
  if (Date.now() > row.expires_at) {
    await ephemeralDel(NS, sessionId);
    return null;
  }
  return row;
}

export async function destroyWebSession(sessionId: string): Promise<void> {
  await ephemeralDel(NS, sessionId);
}

/**
 * 滑动续期：延长存储中的 expires_at 并重置 TTL。
 * 仅在剩余有效期低于阈值时由请求钩子调用，避免每个请求都写存储。
 */
export async function touchWebSession(session: WebSessionRecord): Promise<WebSessionRecord> {
  const ttl = sessionTtlSeconds();
  const renewed: WebSessionRecord = { ...session, expires_at: Date.now() + ttl * 1000 };
  await ephemeralSetJson(NS, session.session_id, renewed, ttl);
  return renewed;
}

export function toSessionView(session: WebSessionRecord): WebSessionView {
  return {
    user_id: session.user_id,
    role: session.role,
    display_name: session.display_name,
  };
}
