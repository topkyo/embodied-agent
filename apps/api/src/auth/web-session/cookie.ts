import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "ea_session";
const SESSION_TTL_SECONDS = 15 * 60;

export function sessionTtlSeconds(): number {
  return SESSION_TTL_SECONDS;
}

export function resolveSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    return "dev-session-secret";
  }
  throw new Error("SESSION_SECRET 未配置，无法签发 Web session cookie");
}

export function signSessionId(sessionId: string, secret = resolveSessionSecret()): string {
  return createHmac("sha256", secret).update(sessionId).digest("hex");
}

export function buildSessionCookieValue(sessionId: string, secret?: string): string {
  const resolvedSecret = secret ?? resolveSessionSecret();
  return `${sessionId}.${signSessionId(sessionId, resolvedSecret)}`;
}

export function parseSessionCookieValue(raw: string | undefined, secret?: string): string | null {
  if (!raw?.trim()) return null;
  const resolvedSecret = secret ?? resolveSessionSecret();
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const sessionId = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!sessionId || !sig) return null;
  const expected = signSessionId(sessionId, resolvedSecret);
  if (expected.length !== sig.length) return null;
  if (!timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(sig, "utf8"))) {
    return null;
  }
  return sessionId;
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header?.trim()) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function newSessionId(): string {
  return randomUUID();
}

export function sessionCookieOptions(isProd: boolean): {
  httpOnly: true;
  path: "/";
  maxAge: number;
  sameSite: "lax";
  secure: boolean;
} {
  return {
    httpOnly: true,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    sameSite: "lax",
    secure: isProd,
  };
}

export function serializeSessionCookie(
  value: string,
  isProd: boolean,
  maxAge = SESSION_TTL_SECONDS,
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}

export function serializeClearSessionCookie(isProd: boolean): string {
  const parts = [`${SESSION_COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}
