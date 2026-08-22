import { createLogger } from "@embodied-agent/platform";
import { useRedisSessionStore } from "./config.js";

import { redisDel, redisListNamespaceEntries, redisSetJson } from "./redis-session.js";

const log = createLogger("session-redis");
const SESSION_TTL_SECONDS = 15 * 60;
const CONVERSATION_TTL_SECONDS = 7 * 24 * 60 * 60;

export function sessionUsesRedis(): boolean {
  return useRedisSessionStore();
}

export function redisSessionTtlSeconds(namespace: string): number {
  return namespace === "conversation" ? CONVERSATION_TTL_SECONDS : SESSION_TTL_SECONDS;
}

export function redisWriteRow(namespace: string, key: string, value: unknown): void {
  if (!sessionUsesRedis()) return;
  void redisSetJson(namespace, key, value, redisSessionTtlSeconds(namespace)).catch((err) => {
    log.error("set failed", { namespace, key, error: String(err) });
  });
}

export function redisRemoveRow(namespace: string, key: string): void {
  if (!sessionUsesRedis()) return;
  void redisDel(namespace, key).catch((err) => {
    log.error("del failed", { namespace, key, error: String(err) });
  });
}

export async function redisReadAllRows<T>(namespace: string): Promise<Map<string, T>> {
  if (!sessionUsesRedis()) return new Map();
  return redisListNamespaceEntries<T>(namespace);
}
