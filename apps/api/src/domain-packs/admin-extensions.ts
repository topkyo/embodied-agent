import type { FastifyInstance } from "fastify";
import { getEffectiveSettings } from "../settings/store.js";
import { domainPackAdminRouteContext } from "./admin-route-context.js";
import { API_DOMAIN_PACK_MANIFEST, DOMAIN_PACK_ADMIN_ROUTE_MODULES } from "./catalog.js";

type DomainPackAdminRouteModule = {
  registerDomainPackAdminRoutes?: (
    app: FastifyInstance,
    context: ReturnType<typeof domainPackAdminRouteContext>,
  ) => void | Promise<void>;
};

async function importAdminRouteModule(specifier: string): Promise<DomainPackAdminRouteModule> {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return (await import(new URL(specifier, import.meta.url).href)) as DomainPackAdminRouteModule;
  }
  return (await import(specifier)) as DomainPackAdminRouteModule;
}

export async function registerDomainPackAdminExtensionRoutes(app: FastifyInstance): Promise<void> {
  const context = domainPackAdminRouteContext(app.mqtt);
  const activeDomain = getEffectiveSettings().active_domain;
  const entry = API_DOMAIN_PACK_MANIFEST.find((pack) => pack.id === activeDomain);
  if (!entry) {
    throw new Error(`active_domain ${activeDomain || "(empty)"} 不在 Domain Pack catalog 中。`);
  }
  if (entry.status !== "live") {
    throw new Error(
      `active_domain ${entry.id} 是 placeholder Domain Pack，不能注册 admin routes。`,
    );
  }
  const adminRouteModule = DOMAIN_PACK_ADMIN_ROUTE_MODULES.get(entry.id);
  if (!adminRouteModule) return;
  const mod = await importAdminRouteModule(adminRouteModule);
  if (typeof mod.registerDomainPackAdminRoutes !== "function") {
    throw new Error(
      `Domain Pack ${entry.id} adminRouteModule 未导出 registerDomainPackAdminRoutes()`,
    );
  }
  await mod.registerDomainPackAdminRoutes(app, context);
}
