import { DEMO_READONLY_ACTOR } from "../demo/readonly.js";
import { matchAdminToken } from "../settings/admin-tokens.js";
import type { WebSessionRecord } from "../auth/web-session/types.js";

export type AdminAuthRequest = {
  headers: Record<string, unknown>;
  adminActor?: string;
  demoReadonlyPublic?: boolean;
  webSession?: WebSessionRecord | null;
};

export function requireAdmin(request: AdminAuthRequest): boolean {
  if (request.demoReadonlyPublic) {
    request.adminActor = DEMO_READONLY_ACTOR;
    return true;
  }
  if (request.webSession?.role === "admin") {
    request.adminActor = `web:${request.webSession.user_id}`;
    return true;
  }
  const header = request.headers["x-admin-token"];
  if (typeof header !== "string") return false;

  const result = matchAdminToken(header);
  if (result.matched && result.actor) {
    request.adminActor = result.actor;
    return true;
  }
  return false;
}

/**
 * Read-only ops endpoints (overview / nodes / readiness / alert-rules /
 * report-schedules / commands) for any authenticated web user.
 * Writes and platform config still use requireAdmin.
 */
export function requireOperator(request: AdminAuthRequest): boolean {
  if (requireAdmin(request)) return true;
  if (request.webSession?.user_id) {
    request.adminActor = `web:${request.webSession.user_id}`;
    return true;
  }
  return false;
}

export function getAdminActor(request: AdminAuthRequest): string | undefined {
  return request.adminActor;
}
