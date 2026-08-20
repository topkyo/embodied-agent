import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { atomicWriteJson } from "@embodied-agent/platform";
import { currentDeploymentId, deploymentScopedPath } from "../fs/deployment-path.js";

export type NotificationPrefs = {
  deployment_id: string;
  user_id: string;
  /** 今日内不再发 L2 运营建议 */
  suppress_l2_until?: number;
  updated_at: number;
};

const store = new Map<string, NotificationPrefs>();
const hydratedDeployments = new Set<string>();

function storePath(deployment_id = currentDeploymentId()): string {
  return deploymentScopedPath("notification-prefs.json", deployment_id);
}

function key(user_id: string, deployment_id = currentDeploymentId()): string {
  return `${deployment_id}:${user_id}`;
}

function persist(deployment_id = currentDeploymentId()): void {
  const path = storePath(deployment_id);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  atomicWriteJson(
    path,
    [...store.values()].filter((row) => row.deployment_id === deployment_id),
  );
}

function ensureHydrated(deployment_id = currentDeploymentId()): void {
  if (hydratedDeployments.has(deployment_id)) return;
  const path = storePath(deployment_id);
  if (!existsSync(path)) {
    hydratedDeployments.add(deployment_id);
    return;
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as NotificationPrefs[];
    if (!Array.isArray(raw)) {
      throw new Error("notification-prefs root must be an array");
    }
    for (const row of raw) {
      if (!row?.deployment_id || row.deployment_id !== deployment_id) continue;
      if (row?.user_id) store.set(key(row.user_id, deployment_id), row);
    }
    hydratedDeployments.add(deployment_id);
  } catch (err) {
    throw new Error(`${path} 无法读取或解析：${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}

function endOfLocalDayMs(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function suppressL2ForTonight(user_id: string, now = Date.now()): void {
  const deployment_id = currentDeploymentId();
  ensureHydrated(deployment_id);
  store.set(key(user_id, deployment_id), {
    deployment_id,
    user_id,
    suppress_l2_until: endOfLocalDayMs(now),
    updated_at: now,
  });
  persist(deployment_id);
}

export function isL2SuppressedForUser(user_id: string, now = Date.now()): boolean {
  const deployment_id = currentDeploymentId();
  ensureHydrated(deployment_id);
  const row = store.get(key(user_id, deployment_id));
  if (!row?.suppress_l2_until) return false;
  return now <= row.suppress_l2_until;
}

/** @internal tests */
export function clearNotificationPrefs(): void {
  const deployment_id = currentDeploymentId();
  ensureHydrated(deployment_id);
  for (const [k, row] of [...store.entries()]) {
    if (row.deployment_id === deployment_id) store.delete(k);
  }
  const path = storePath(deployment_id);
  if (existsSync(path)) atomicWriteJson(path, []);
}
