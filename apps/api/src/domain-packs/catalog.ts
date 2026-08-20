import type { DomainPackRuntimeCatalogEntry } from "@embodied-agent/runtime";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ApiDomainPackCatalogEntry = DomainPackRuntimeCatalogEntry & {
  adminRouteModule?: string;
};

export function findRepoRootFrom(startDir: string): string {
  let dir = resolve(startDir);
  const fsRoot = resolve("/");
  while (true) {
    if (existsSync(resolve(dir, "domain-packs.json"))) {
      return dir;
    }
    if (dir === fsRoot) {
      throw new Error(`找不到 domain-packs.json：已从 ${startDir} 向上探测至文件系统根目录。`);
    }
    dir = dirname(dir);
  }
}

function repoRoot(): string {
  return findRepoRootFrom(dirname(fileURLToPath(import.meta.url)));
}

function loadApiDomainPackCatalog(): readonly ApiDomainPackCatalogEntry[] {
  const path = resolve(repoRoot(), "domain-packs.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    packs?: ApiDomainPackCatalogEntry[];
  };
  if (!Array.isArray(parsed.packs) || parsed.packs.length === 0) {
    throw new Error("domain-packs.json 缺少 packs。");
  }
  const seen = new Set<string>();
  return parsed.packs.map((entry) => {
    if (!entry.id || !entry.module || !entry.displayName || !entry.webSlug) {
      throw new Error("domain-packs.json 存在非法 pack entry。");
    }
    if (entry.status !== "live" && entry.status !== "placeholder") {
      throw new Error(`domain-packs.json 中 ${entry.id} status 非法。`);
    }
    if (seen.has(entry.id)) {
      throw new Error(`domain-packs.json 重复 pack id：${entry.id}`);
    }
    seen.add(entry.id);
    return entry;
  });
}

export const API_DOMAIN_PACK_MANIFEST = loadApiDomainPackCatalog();

export const API_DOMAIN_PACK_RUNTIME_CATALOG: readonly DomainPackRuntimeCatalogEntry[] =
  API_DOMAIN_PACK_MANIFEST.map((entry) => ({
    id: entry.id,
    module: entry.module,
    displayName: entry.displayName,
    webSlug: entry.webSlug,
    status: entry.status,
  }));

export const DOMAIN_PACK_ADMIN_ROUTE_MODULES = new Map(
  API_DOMAIN_PACK_MANIFEST.flatMap((entry) =>
    entry.adminRouteModule ? [[entry.id, entry.adminRouteModule] as const] : [],
  ),
);
