import { isAbsolute, relative, resolve } from "node:path";
import {
  FileLockBusyError,
  matrixTimeoutMs,
  validateFileLockStaleConfig,
  withFileLock as withPlatformFileLock,
} from "@embodied-agent/platform";
import { useRedisSessionStore } from "../state/config.js";
import { validateRedisLockConfig, withRedisLock } from "../state/redis-lock.js";
import { dataRoot } from "./deployment-path.js";

export { FileLockBusyError, matrixTimeoutMs, validateFileLockStaleConfig, validateRedisLockConfig };

/**
 * Redis key 用锁路径相对数据根的逻辑段：多实例数据根（AGENT_DATA_DIR）可以不同，
 * 但同一 deployment 的锁必须映射到同一个 redis key，互斥语义才成立。
 */
function redisLockKey(lockPath: string): string {
  const rel = relative(dataRoot(), resolve(lockPath));
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`协调锁路径必须位于 AGENT_DATA_DIR 下: ${lockPath}`);
  }
  return rel;
}

/**
 * Coordination lock: Redis SET NX when STATE_BACKEND=redis, otherwise local file lock.
 * lockPath 必须是 AGENT_DATA_DIR 下的绝对路径（redis 模式下用其相对逻辑段做 key）。
 */
export async function withFileLock<T>(lockPath: string, fn: () => T | Promise<T>): Promise<T> {
  if (useRedisSessionStore()) {
    return withRedisLock(redisLockKey(lockPath), fn);
  }
  return withPlatformFileLock(lockPath, fn);
}
