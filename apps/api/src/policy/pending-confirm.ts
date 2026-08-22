import { createLogger } from "@embodied-agent/platform";
import { mkdirSync, readFileSync, existsSync } from "node:fs";

import { dirname } from "node:path";
import type { IntentPayload } from "@embodied-agent/core";
import { atomicWriteJson } from "@embodied-agent/platform";
import { currentDeploymentId, deploymentScopedPath } from "../fs/deployment-path.js";
import {
  redisReadAllRows,
  redisRemoveRow,
  redisWriteRow,
  sessionUsesRedis,
} from "../state/session-backing.js";
import { redisGetJson } from "../state/redis-session.js";
import { assertRedisSessionsReady } from "../state/session-hydrate.js";

const log = createLogger("pending-confirm");
export type PendingConfirm = {
  deployment_id: string;
  intent: IntentPayload;
  user_id: string;
  conversation_id: string;
  model: string;
  scene_skill_id?: string;
  created_at: number;
  expires_at: number;
};

const TTL_MS = 15 * 60 * 1000;
const store = new Map<string, PendingConfirm>();
const hydratedDeployments = new Set<string>();

function storePath(deployment_id = currentDeploymentId()): string {
  return deploymentScopedPath("pending-confirm.json", deployment_id);
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
    const raw = JSON.parse(readFileSync(path, "utf8")) as PendingConfirm[];
    if (!Array.isArray(raw)) {
      throw new Error("pending-confirm root must be an array");
    }
    const now = Date.now();
    for (const row of raw) {
      if (!row?.deployment_id || row.deployment_id !== deployment_id) continue;
      if (!row?.user_id || !row?.conversation_id || !row?.intent) continue;
      if (now > row.expires_at) continue;
      store.set(storageKey(row), row);
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

/** 文件后端：外部脚本可能写过 pending-confirm.json，读前重载避免与内存 store 漂移。 */
export function reloadPendingConfirmFromFile(): void {
  if (sessionUsesRedis()) return;
  const deployment_id = currentDeploymentId();
  for (const [k, row] of [...store.entries()]) {
    if (row.deployment_id === deployment_id) store.delete(k);
  }
  hydrateFromFile(deployment_id);
  hydratedDeployments.add(deployment_id);
}

export async function hydratePendingConfirmFromRedis(): Promise<void> {
  if (!sessionUsesRedis()) return;
  const deployment_id = currentDeploymentId();
  const rows = await redisReadAllRows<PendingConfirm>("pending-confirm");
  const now = Date.now();
  for (const [k, row] of [...store.entries()]) {
    if (row.deployment_id === deployment_id) store.delete(k);
  }
  for (const [k, row] of rows) {
    if (!row?.deployment_id || row.deployment_id !== deployment_id) continue;
    if (!row?.user_id || !row?.conversation_id || !row?.intent) continue;
    if (now > row.expires_at) {
      redisRemoveRow("pending-confirm", k);
      continue;
    }
    store.set(k, row);
  }
}

function storageKey(entry: {
  deployment_id?: string;
  user_id: string;
  conversation_id: string;
  scene_skill_id?: string;
}): string {
  const deployment_id = entry.deployment_id ?? currentDeploymentId();
  return entry.scene_skill_id
    ? `${deployment_id}:${entry.user_id}:${entry.conversation_id}:${entry.scene_skill_id}`
    : `${deployment_id}:${entry.user_id}:${entry.conversation_id}`;
}

export function setPendingConfirm(
  entry: Omit<PendingConfirm, "deployment_id" | "created_at" | "expires_at">,
): void {
  assertRedisSessionsReady("setPendingConfirm");
  const deployment_id = currentDeploymentId();
  ensureFileHydrated(deployment_id);
  const now = Date.now();
  const row: PendingConfirm = {
    ...entry,
    deployment_id,
    created_at: now,
    expires_at: now + TTL_MS,
  };
  const k = storageKey(row);
  store.set(k, row);
  if (sessionUsesRedis()) {
    redisWriteRow("pending-confirm", k, row);
  } else {
    persistToFile(deployment_id);
  }
  log.info("set", {
    user_id: entry.user_id,
    conversation_id: entry.conversation_id,
    skill: entry.intent.skill,
  });
}

export function listPendingConfirmsForConversation(
  user_id: string,
  conversation_id: string,
): PendingConfirm[] {
  ensureFileHydrated();
  clearExpiredPending();
  const now = Date.now();
  return [...store.values()].filter(
    (row) =>
      row.deployment_id === currentDeploymentId() &&
      row.user_id === user_id &&
      row.conversation_id === conversation_id &&
      now <= row.expires_at,
  );
}

/** Redis 多副本：读穿单键，避免本进程缓存未 hydrate 时漏读。 */
export async function refreshPendingConfirmFromRedis(
  user_id: string,
  conversation_id: string,
  scene_skill_id?: string,
): Promise<void> {
  if (!sessionUsesRedis()) return;
  const k = storageKey({ user_id, conversation_id, scene_skill_id });
  const row = await redisGetJson<PendingConfirm>("pending-confirm", k);
  if (!row?.deployment_id || row.deployment_id !== currentDeploymentId()) return;
  if (!row?.user_id || !row.conversation_id || !row.intent) return;
  if (Date.now() > row.expires_at) {
    redisRemoveRow("pending-confirm", k);
    store.delete(k);
    return;
  }
  store.set(k, row);
}

export async function refreshPendingConfirmsForUserFromRedis(user_id: string): Promise<void> {
  if (!sessionUsesRedis()) return;
  const deployment_id = currentDeploymentId();
  const prefix = `${deployment_id}:${user_id}:`;
  const rows = await redisReadAllRows<PendingConfirm>("pending-confirm");
  const now = Date.now();
  for (const [k, row] of rows) {
    if (!k.startsWith(prefix)) continue;
    if (!row?.deployment_id || row.deployment_id !== deployment_id) continue;
    if (!row?.user_id || row.user_id !== user_id || !row.intent) continue;
    if (now > row.expires_at) {
      redisRemoveRow("pending-confirm", k);
      store.delete(k);
      continue;
    }
    store.set(k, row);
  }
}

export function getPendingConfirm(
  user_id: string,
  conversation_id: string,
  scene_skill_id?: string,
): PendingConfirm | undefined {
  assertRedisSessionsReady("getPendingConfirm");
  const rows = listPendingConfirmsForConversation(user_id, conversation_id);
  if (scene_skill_id) {
    return rows.find((row) => row.scene_skill_id === scene_skill_id);
  }
  if (rows.length === 1) return rows[0];
  return undefined;
}

export function listPendingConfirmsForUser(user_id: string): PendingConfirm[] {
  ensureFileHydrated();
  clearExpiredPending();
  const now = Date.now();
  return [...store.values()].filter(
    (row) =>
      row.deployment_id === currentDeploymentId() &&
      row.user_id === user_id &&
      now <= row.expires_at,
  );
}

export function countAllPendingConfirms(): number {
  ensureFileHydrated();
  clearExpiredPending();
  const now = Date.now();
  return [...store.values()].filter(
    (row) => row.deployment_id === currentDeploymentId() && now <= row.expires_at,
  ).length;
}

export function listAllPendingConfirms(): PendingConfirm[] {
  ensureFileHydrated();
  clearExpiredPending();
  const now = Date.now();
  return [...store.values()].filter(
    (row) => row.deployment_id === currentDeploymentId() && now <= row.expires_at,
  );
}

/** 微信/集成通道 conversation_id 不一致时按用户解析；多场景并存须显式 scene_skill_id */
export function getPendingConfirmForUser(
  user_id: string,
  scene_skill_id?: string,
): PendingConfirm | undefined {
  const rows = listPendingConfirmsForUser(user_id);
  if (scene_skill_id) {
    return rows.find((row) => row.scene_skill_id === scene_skill_id);
  }
  if (rows.length === 1) return rows[0];
  return undefined;
}

export function clearPendingConfirm(
  user_id: string,
  conversation_id: string,
  scene_skill_id?: string,
): void {
  const deployment_id = currentDeploymentId();
  ensureFileHydrated(deployment_id);
  const keys = scene_skill_id
    ? [storageKey({ user_id, conversation_id, scene_skill_id })]
    : [...store.entries()]
        .filter(
          ([, row]) =>
            row.deployment_id === deployment_id &&
            row.user_id === user_id &&
            row.conversation_id === conversation_id,
        )
        .map(([k]) => k);
  for (const k of keys) store.delete(k);
  if (sessionUsesRedis()) {
    for (const k of keys) redisRemoveRow("pending-confirm", k);
  } else {
    persistToFile(deployment_id);
  }
}

function normalizeConfirmInput(text: string): string {
  return text
    .trim()
    .replace(/^[\s「『【'"']+|[\s」』】'"']+$/g, "")
    .replace(/[。．.!！?？,，、\s]+$/g, "")
    .trim();
}

const CONFIRM_EXACT = /^(确认|确定|好的|好|执行|可以|行|ok|yes|y)$/i;
const CONFIRM_PHRASE = /^(好的)?确认(一下|执行|操作)?$/i;
const CANCEL_EXACT = /^(取消|算了|不要|否|no|n)$/i;
const CANCEL_PHRASE = /^取消(操作|吧)?$/i;

export function isConfirmText(text: string): boolean {
  const t = normalizeConfirmInput(text);
  if (!t) return false;
  if (CONFIRM_EXACT.test(t) || CONFIRM_PHRASE.test(t)) return true;
  if (t.length <= 8 && t.includes("确认") && !t.includes("不")) return true;
  return false;
}

export function isCancelText(text: string): boolean {
  const t = normalizeConfirmInput(text);
  if (!t) return false;
  return CANCEL_EXACT.test(t) || CANCEL_PHRASE.test(t);
}

export function clearExpiredPending(): void {
  const deployment_id = currentDeploymentId();
  ensureFileHydrated(deployment_id);
  const now = Date.now();
  let changed = false;
  for (const [k, row] of store) {
    if (row.deployment_id !== deployment_id) continue;
    if (now > row.expires_at) {
      store.delete(k);
      if (sessionUsesRedis()) {
        redisRemoveRow("pending-confirm", k);
      }
      changed = true;
    }
  }
  if (changed && !sessionUsesRedis()) {
    persistToFile(deployment_id);
  }
}

/** @internal tests */
export function clearAllPendingConfirm(): void {
  const deployment_id = currentDeploymentId();
  ensureFileHydrated(deployment_id);
  if (sessionUsesRedis()) {
    for (const [k, row] of [...store.entries()]) {
      if (row.deployment_id !== deployment_id) continue;
      redisRemoveRow("pending-confirm", k);
    }
  }
  for (const [k, row] of [...store.entries()]) {
    if (row.deployment_id === deployment_id) store.delete(k);
  }
  hydratedDeployments.delete(deployment_id);
  const path = storePath(deployment_id);
  if (existsSync(path)) atomicWriteJson(path, []);
}
