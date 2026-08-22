export const DEV_CORS_ALLOWLIST = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
] as const;

export function assertProductionCorsOrigin(raw: string | undefined, isProd: boolean): void {
  if (isProd && raw === "*") {
    throw new Error("CORS_ORIGIN must not be '*' in production");
  }
}

export function resolveCorsAllowlist(raw: string | undefined, isProd: boolean): readonly string[] {
  assertProductionCorsOrigin(raw, isProd);
  if (raw === "*") {
    return DEV_CORS_ALLOWLIST;
  }
  const trimmed = raw?.trim();
  if (trimmed) {
    return trimmed
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return isProd ? [] : DEV_CORS_ALLOWLIST;
}

export function isOriginAllowed(allowlist: readonly string[], origin: string | undefined): boolean {
  if (!origin) return false;
  return allowlist.includes(origin);
}

export function corsAllowHeaders(originAllowed: boolean): string {
  const base = "Content-Type, Authorization";
  return originAllowed ? `${base}, x-admin-token` : base;
}

export function applyCorsHeaders(
  request: { headers: Record<string, string | string[] | undefined> },
  reply: { header: (name: string, value: string) => unknown },
  allowlist: readonly string[],
): { origin: string | undefined; originAllowed: boolean } {
  const originHeader = request.headers.origin;
  const origin = typeof originHeader === "string" ? originHeader.trim() : undefined;
  const originAllowed = isOriginAllowed(allowlist, origin);
  if (originAllowed && origin) {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Allow-Credentials", "true");
  }
  // Allow-Origin 按请求 Origin 动态回显，缓存必须按 Origin 区分。
  reply.header("Vary", "Origin");
  reply.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
  reply.header("Access-Control-Allow-Headers", corsAllowHeaders(originAllowed));
  return { origin, originAllowed };
}

/**
 * 服务端强制：带 Origin 的跨源请求携带 x-admin-token 时，Origin 必须在 allowlist 内。
 * 无 Origin 的请求（curl、服务端脚本、同源非跨域）不受限。
 */
export function rejectAdminTokenFromDisallowedOrigin(
  request: { headers: Record<string, string | string[] | undefined> },
  cors: { origin: string | undefined; originAllowed: boolean },
): boolean {
  if (!cors.origin || cors.originAllowed) return false;
  return request.headers["x-admin-token"] !== undefined;
}
