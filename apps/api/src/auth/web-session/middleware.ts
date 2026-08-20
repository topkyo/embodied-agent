import type { FastifyRequest } from "fastify";
import type { WebSessionRecord } from "./types.js";

declare module "fastify" {
  interface FastifyRequest {
    webSession?: WebSessionRecord | null;
  }
}
import { parseCookieHeader, parseSessionCookieValue, SESSION_COOKIE_NAME } from "./cookie.js";
import { loadWebSession, toSessionView } from "./session.js";

export type WebAuthRequest = {
  headers: Record<string, unknown>;
  webSession?: WebSessionRecord | null;
};

export function readSessionIdFromRequest(request: WebAuthRequest): string | null {
  const cookieHeader = request.headers.cookie;
  const cookies = parseCookieHeader(typeof cookieHeader === "string" ? cookieHeader : undefined);
  return parseSessionCookieValue(cookies[SESSION_COOKIE_NAME]);
}

export async function resolveWebSessionFromRequest(
  request: WebAuthRequest,
): Promise<WebSessionRecord | null> {
  const sessionId = readSessionIdFromRequest(request);
  if (!sessionId) return null;
  return loadWebSession(sessionId);
}

export async function attachWebSession(request: FastifyRequest | WebAuthRequest): Promise<void> {
  request.webSession = await resolveWebSessionFromRequest(request);
}

export function requireWebSession(request: WebAuthRequest): boolean {
  return Boolean(request.webSession);
}

export function requireAdminSession(request: WebAuthRequest): boolean {
  return request.webSession?.role === "admin";
}

export function getWebSessionView(request: WebAuthRequest) {
  if (!request.webSession) return null;
  return toSessionView(request.webSession);
}
