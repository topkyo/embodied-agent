import { randomBytes } from "node:crypto";
import { FileLockBusyError, matrixTimeoutMs } from "@embodied-agent/platform";
import { getRedisClient } from "./redis-client.js";

const LOCK_PREFIX = "coord-lock:";

const REDIS_LOCK_SLACK_MS = 60_000;

function lockTtlMs(): number {
  const raw = process.env.REDIS_LOCK_TTL_MS?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return matrixTimeoutMs() + REDIS_LOCK_SLACK_MS;
}

export function validateRedisLockConfig(): void {
  const raw = process.env.REDIS_LOCK_TTL_MS?.trim();
  if (!raw) return;
  const ttl = Number(raw);
  if (!Number.isFinite(ttl) || ttl <= 0) return;
  const matrix = matrixTimeoutMs();
  if (ttl < matrix) {
    throw new Error(
      `REDIS_LOCK_TTL_MS (${ttl}) must be >= INTENT_PROMOTE_MATRIX_TIMEOUT_MS (${matrix})`,
    );
  }
}

async function releaseRedisLock(key: string, token: string): Promise<void> {
  const client = await getRedisClient();
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await client.eval(script, { keys: [key], arguments: [token] });
}

export async function withRedisLock<T>(lockKey: string, fn: () => T | Promise<T>): Promise<T> {
  const client = await getRedisClient();
  const redisKey = `${LOCK_PREFIX}${lockKey}`;
  const token = randomBytes(16).toString("hex");
  const acquired = await client.set(redisKey, token, { NX: true, PX: lockTtlMs() });
  if (!acquired) {
    throw new FileLockBusyError(lockKey);
  }
  try {
    return await fn();
  } finally {
    try {
      await releaseRedisLock(redisKey, token);
    } catch {
      /* lock may have expired; next acquirer will proceed */
    }
  }
}
