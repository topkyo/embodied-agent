import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { IntentPayload, SkillName } from "@embodied-agent/core";
import { activeClarificationHandler } from "@embodied-agent/runtime";
import { atomicWriteJson } from "@embodied-agent/platform";
import { currentDeploymentId, deploymentScopedPath } from "../fs/deployment-path.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";
import {
  redisReadAllRows,
  redisRemoveRow,
  redisWriteRow,
  sessionUsesRedis,
} from "../state/session-backing.js";
import { redisGetJson } from "../state/redis-session.js";
import { assertRedisSessionsReady } from "../state/session-hydrate.js";

export type ClarificationSlot = string;
export type ClarificationPartial = Record<string, string | number | undefined>;

export type PendingClarification = {
  deployment_id: string;
  user_id: string;
  conversation_id: string;
  /** 期望续接的技能方向 */
  expected_skill?: SkillName;
  missing_slots: ClarificationSlot[];
  partial: ClarificationPartial;
  last_hint?: string;
  last_rejected_intent?: IntentPayload;
  last_reject_reason?: string;
  created_at: number;
  expires_at: number;
};

const TTL_MS = 15 * 60 * 1000;
const store = new Map<string, PendingClarification>();
const hydratedDeployments = new Set<string>();

function storePath(deployment_id = currentDeploymentId()): string {
  return deploymentScopedPath("pending-clarification.json", deployment_id);
}

function key(
  user_id: string,
  conversation_id: string,
  deployment_id = currentDeploymentId(),
): string {
  return `${deployment_id}:${user_id}:${conversation_id}`;
}

function persistToFile(deployment_id = currentDeploymentId()): void {
  const path = storePath(deployment_id);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const rows = [...store.values()].filter(
    (r) => r.deployment_id === deployment_id && Date.now() <= r.expires_at,
  );
  atomicWriteJson(path, rows);
}

function hydrateFromFile(deployment_id = currentDeploymentId()): void {
  const path = storePath(deployment_id);
  if (!existsSync(path)) return;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as PendingClarification[];
    if (!Array.isArray(raw)) {
      throw new Error("pending-clarification root must be an array");
    }
    const now = Date.now();
    for (const row of raw) {
      if (!row?.deployment_id || row.deployment_id !== deployment_id) continue;
      if (!row?.user_id || !row?.conversation_id) continue;
      if (now > row.expires_at) continue;
      store.set(key(row.user_id, row.conversation_id, deployment_id), row);
    }
  } catch (err) {
    throw new Error(`${path} 无法读取或解析：${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}

function ensureFileHydrated(deployment_id = currentDeploymentId()): void {
  if (sessionUsesRedis()) return;
  if (hydratedDeployments.has(deployment_id)) return;
  hydrateFromFile(deployment_id);
  hydratedDeployments.add(deployment_id);
}

export async function hydratePendingClarificationFromRedis(): Promise<void> {
  if (!sessionUsesRedis()) return;
  const deployment_id = currentDeploymentId();
  const rows = await redisReadAllRows<PendingClarification>("pending-clarification");
  const now = Date.now();
  for (const [k, row] of [...store.entries()]) {
    if (row.deployment_id === deployment_id) store.delete(k);
  }
  for (const [k, row] of rows) {
    if (!row?.deployment_id || row.deployment_id !== deployment_id) continue;
    if (!row?.user_id || !row?.conversation_id) continue;
    if (now > row.expires_at) {
      redisRemoveRow("pending-clarification", k);
      continue;
    }
    store.set(k, row);
  }
}

export function setPendingClarification(
  entry: Omit<PendingClarification, "deployment_id" | "created_at" | "expires_at">,
): void {
  assertRedisSessionsReady("setPendingClarification");
  const deployment_id = currentDeploymentId();
  ensureFileHydrated(deployment_id);
  const now = Date.now();
  const k = key(entry.user_id, entry.conversation_id, deployment_id);
  const row: PendingClarification = {
    ...entry,
    deployment_id,
    created_at: now,
    expires_at: now + TTL_MS,
  };
  store.set(k, row);
  if (sessionUsesRedis()) {
    redisWriteRow("pending-clarification", k, row);
  } else {
    persistToFile(deployment_id);
  }
}

export async function refreshPendingClarificationFromRedis(
  user_id: string,
  conversation_id: string,
): Promise<void> {
  if (!sessionUsesRedis()) return;
  const deployment_id = currentDeploymentId();
  const k = key(user_id, conversation_id, deployment_id);
  const row = await redisGetJson<PendingClarification>("pending-clarification", k);
  if (!row?.deployment_id || row.deployment_id !== deployment_id) return;
  if (!row?.user_id || !row.conversation_id) return;
  if (Date.now() > row.expires_at) {
    redisRemoveRow("pending-clarification", k);
    store.delete(k);
    return;
  }
  store.set(k, row);
}

export function getPendingClarification(
  user_id: string,
  conversation_id: string,
): PendingClarification | undefined {
  assertRedisSessionsReady("getPendingClarification");
  ensureFileHydrated();
  clearExpired();
  return store.get(key(user_id, conversation_id));
}

export function clearPendingClarification(user_id: string, conversation_id: string): void {
  const deployment_id = currentDeploymentId();
  ensureFileHydrated(deployment_id);
  const k = key(user_id, conversation_id, deployment_id);
  store.delete(k);
  if (sessionUsesRedis()) {
    redisRemoveRow("pending-clarification", k);
  } else {
    persistToFile(deployment_id);
  }
}

export function clearExpired(): void {
  const deployment_id = currentDeploymentId();
  ensureFileHydrated(deployment_id);
  const now = Date.now();
  let changed = false;
  for (const [k, row] of store) {
    if (row.deployment_id !== deployment_id) continue;
    if (now > row.expires_at) {
      store.delete(k);
      if (sessionUsesRedis()) {
        redisRemoveRow("pending-clarification", k);
      }
      changed = true;
    }
  }
  if (changed && !sessionUsesRedis()) {
    persistToFile(deployment_id);
  }
}

function partialFromIntent(intent: IntentPayload): PendingClarification["partial"] {
  return (activeClarificationHandler(getPlatformRuntimeContext())?.partialFromIntent?.(intent) ??
    {}) as PendingClarification["partial"];
}

export function recordRejectedIntent(
  user_id: string,
  conversation_id: string,
  intent: IntentPayload,
  reason: string,
): void {
  const existing = getPendingClarification(user_id, conversation_id);
  const partial = {
    ...existing?.partial,
    ...partialFromIntent(intent),
  };
  setPendingClarification({
    user_id,
    conversation_id,
    expected_skill: intent.skill,
    missing_slots: existing?.missing_slots ?? [],
    partial,
    last_hint: existing?.last_hint,
    last_rejected_intent: intent,
    last_reject_reason: reason,
  });
}

/** @internal tests */
export function clearAllPendingClarification(): void {
  const deployment_id = currentDeploymentId();
  ensureFileHydrated(deployment_id);
  if (sessionUsesRedis()) {
    for (const [k, row] of [...store.entries()]) {
      if (row.deployment_id !== deployment_id) continue;
      redisRemoveRow("pending-clarification", k);
    }
  }
  for (const [k, row] of [...store.entries()]) {
    if (row.deployment_id === deployment_id) store.delete(k);
  }
  hydratedDeployments.delete(deployment_id);
  const path = storePath(deployment_id);
  if (existsSync(path)) atomicWriteJson(path, []);
}
