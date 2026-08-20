import type { FastifyInstance } from "fastify";

export const DEMO_READONLY_ACTOR = "demo-readonly";

const MUTATION_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

const PUBLIC_GET_EXACT = new Set([
  "/health",
  "/domain-packs",
  "/lang-suggest",
  "/metrics",
  "/channels",
  "/admin/status",
  "/admin/overview",
  "/admin/domain-packs",
  "/admin/platform/readiness",
]);

const PUBLIC_GET_PREFIXES = [
  "/admin/commands",
  "/admin/alert-rules",
  "/admin/report-schedules",
] as const;

declare module "fastify" {
  interface FastifyRequest {
    demoReadonlyPublic?: boolean;
  }
}

/**
 * Fail visibly when DEMO_READONLY is set to a non-canonical value.
 * Production (non-development/test) must also set DEMO_STACK=1 so anonymous
 * demo APIs cannot be enabled by accident on a customer deployment.
 */
export function assertDemoReadonlyEnv(): void {
  const raw = process.env.DEMO_READONLY;
  if (raw === undefined || raw.trim() === "") return;
  if (raw.trim() !== "1") {
    throw new Error(`DEMO_READONLY 只允许显式设为 1；当前值无效：${JSON.stringify(raw)}`);
  }
  const mode = process.env.NODE_ENV;
  const isExplicitDev = mode === "development" || mode === "test";
  if (!isExplicitDev && process.env.DEMO_STACK?.trim() !== "1") {
    throw new Error(
      "生产语义下启用 DEMO_READONLY=1 必须同时显式设置 DEMO_STACK=1（仅匿名演示栈）；客户部署禁止打开只读公开面。",
    );
  }
}

export function isDemoReadonlyEnabled(): boolean {
  return process.env.DEMO_READONLY?.trim() === "1";
}

export function requestPathname(url: string): string {
  return url.split("?")[0] ?? url;
}

export function isDemoReadonlyPublicGet(method: string, pathname: string): boolean {
  if (method !== "GET") return false;
  if (PUBLIC_GET_EXACT.has(pathname)) return true;
  return PUBLIC_GET_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function registerDemoReadonlyHook(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    if (!isDemoReadonlyEnabled()) return;
    if (request.method === "OPTIONS") return;

    const pathname = requestPathname(request.url);
    if (isDemoReadonlyPublicGet(request.method, pathname)) {
      request.demoReadonlyPublic = true;
      return;
    }

    if (MUTATION_METHODS.has(request.method)) {
      return reply.status(403).send({ error: "demo_readonly_write_forbidden" });
    }
  });
}
