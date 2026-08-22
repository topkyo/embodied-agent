import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { atomicWriteJson } from "@embodied-agent/platform";
import { currentDeploymentId, deploymentScopedPath } from "../fs/deployment-path.js";
import {
  redisReadAllRows,
  redisRemoveRow,
  redisWriteRow,
  sessionUsesRedis,
} from "../state/session-backing.js";
import { assertRedisSessionsReady } from "../state/session-hydrate.js";

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
  at: string;
};

export type ConversationSession = {
  deployment_id: string;
  user_id: string;
  conversation_id: string;
  turns: ConversationTurn[];
  updated_at: number;
};

const sessions = new Map<string, ConversationSession>();
const hydratedDeployments = new Set<string>();

function sessionKey(
  user_id: string,
  conversation_id: string,
  deployment_id = currentDeploymentId(),
): string {
  return `${deployment_id}:${user_id}:${conversation_id}`;
}

function storePath(deployment_id = currentDeploymentId()): string {
  return deploymentScopedPath("conversation-history.json", deployment_id);
}

function maxTurns(): number {
  const n = Number.parseInt(process.env.CONVERSATION_MAX_TURNS ?? "10", 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function trimTurns(turns: ConversationTurn[]): ConversationTurn[] {
  const cap = maxTurns();
  if (turns.length <= cap) return turns;
  return turns.slice(turns.length - cap);
}

function persistToFile(deployment_id = currentDeploymentId()): void {
  const path = storePath(deployment_id);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  atomicWriteJson(
    path,
    [...sessions.values()].filter((row) => row.deployment_id === deployment_id),
  );
}

function hydrateFromFile(deployment_id = currentDeploymentId()): void {
  const path = storePath(deployment_id);
  if (!existsSync(path)) return;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as ConversationSession[];
    if (!Array.isArray(raw)) {
      throw new Error("conversation-history root must be an array");
    }
    for (const row of raw) {
      if (!row?.deployment_id || row.deployment_id !== deployment_id) continue;
      if (!row?.user_id || !row?.conversation_id || !Array.isArray(row.turns)) {
        continue;
      }
      sessions.set(sessionKey(row.user_id, row.conversation_id, deployment_id), {
        ...row,
        turns: trimTurns(row.turns),
      });
    }
  } catch (err) {
    throw new Error(`${path} 无法读取或解析：${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}

function ensureHydrated(): void {
  const deployment_id = currentDeploymentId();
  if (hydratedDeployments.has(deployment_id)) return;
  if (sessionUsesRedis()) return;
  hydrateFromFile(deployment_id);
  hydratedDeployments.add(deployment_id);
}

export async function hydrateConversationFromRedis(): Promise<void> {
  if (!sessionUsesRedis()) return;
  const deployment_id = currentDeploymentId();
  const rows = await redisReadAllRows<ConversationSession>("conversation");
  for (const [k, row] of [...sessions.entries()]) {
    if (row.deployment_id === deployment_id) sessions.delete(k);
  }
  for (const [k, row] of rows) {
    if (!row?.deployment_id || row.deployment_id !== deployment_id) continue;
    if (!row?.user_id || !row?.conversation_id || !Array.isArray(row.turns)) {
      continue;
    }
    sessions.set(k, {
      ...row,
      turns: trimTurns(row.turns),
    });
  }
  hydratedDeployments.add(deployment_id);
}

export function getConversationHistory(
  user_id: string,
  conversation_id: string,
): readonly ConversationTurn[] {
  assertRedisSessionsReady("getConversationHistory");
  ensureHydrated();
  const row = sessions.get(sessionKey(user_id, conversation_id));
  return row?.turns ?? [];
}

/** LLM 输入用：不含时间戳 */
export function getConversationHistoryForLlm(
  user_id: string,
  conversation_id: string,
): { role: "user" | "assistant"; content: string }[] {
  return getConversationHistory(user_id, conversation_id).map((t) => ({
    role: t.role,
    content: t.content,
  }));
}

export function appendConversationTurns(
  user_id: string,
  conversation_id: string,
  turns: { role: "user" | "assistant"; content: string }[],
): void {
  assertRedisSessionsReady("appendConversationTurns");
  ensureHydrated();
  const deployment_id = currentDeploymentId();
  const key = sessionKey(user_id, conversation_id, deployment_id);
  const now = Date.now();
  const existing = sessions.get(key);
  const merged: ConversationTurn[] = [
    ...(existing?.turns ?? []),
    ...turns.map((t) => ({
      role: t.role,
      content: t.content.trim(),
      at: new Date().toISOString(),
    })),
  ].filter((t) => t.content.length > 0);

  const session: ConversationSession = {
    deployment_id,
    user_id,
    conversation_id,
    turns: trimTurns(merged),
    updated_at: now,
  };
  sessions.set(key, session);
  if (process.env.NODE_ENV !== "test" || process.env.AGENT_DATA_DIR) {
    if (sessionUsesRedis()) {
      redisWriteRow("conversation", key, session);
    } else {
      persistToFile(deployment_id);
    }
  }
}

/** @internal tests */
export function clearAllConversationSessions(): void {
  const deployment_id = currentDeploymentId();
  if (sessionUsesRedis()) {
    for (const [k, row] of [...sessions.entries()]) {
      if (row.deployment_id !== deployment_id) continue;
      redisRemoveRow("conversation", k);
    }
  }
  for (const [k, row] of [...sessions.entries()]) {
    if (row.deployment_id === deployment_id) sessions.delete(k);
  }
  hydratedDeployments.delete(deployment_id);
  const path = storePath(deployment_id);
  if (existsSync(path)) atomicWriteJson(path, []);
}
