import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

let cachedDefault: { cwd: string; path: string } | undefined;

/** 测试用：清除 defaultDataRoot 按 cwd 的缓存。 */
export function resetAgentDataRootCache(): void {
  cachedDefault = undefined;
}

function resolveApiPackageRepoRoot(cwd: string): string | null {
  if (basename(cwd) !== "api" || basename(dirname(cwd)) !== "apps") return null;
  const pkgPath = resolve(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
      if (pkg.name !== "@embodied-agent/api") return null;
    } catch {
      return null;
    }
  }
  return resolve(cwd, "../..");
}

function computeDefaultDataRoot(cwd: string): string {
  const repoRoot = resolveApiPackageRepoRoot(cwd);
  if (repoRoot) {
    return resolve(repoRoot, ".agentstack/dev-profiles/default/data");
  }
  return resolve(cwd, ".agentstack/dev-profiles/default/data");
}

function resolveConfiguredDataDir(cwd: string, configured: string): string {
  const isAbsolute = configured.startsWith("/") || /^[A-Za-z]:[\\/]/.test(configured);
  if (isAbsolute) return configured;
  const repoRoot = resolveApiPackageRepoRoot(cwd);
  if (repoRoot) return resolve(repoRoot, configured);
  return resolve(cwd, configured);
}

/** 未设置 AGENT_DATA_DIR 时的默认持久化根。 */
export function defaultDataRoot(cwd = process.cwd()): string {
  if (cachedDefault?.cwd === cwd) return cachedDefault.path;
  const path = computeDefaultDataRoot(cwd);
  cachedDefault = { cwd, path };
  return path;
}

/** 显式 AGENT_DATA_DIR（trim 后非空）优先，否则 defaultDataRoot。相对路径在 apps/api cwd 时按仓库根解析。 */
export function resolveAgentDataDir(cwd = process.cwd()): string {
  const configured = process.env.AGENT_DATA_DIR?.trim();
  if (!configured) return defaultDataRoot(cwd);

  return resolveConfiguredDataDir(cwd, configured);
}
