import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { atomicWriteJson } from "@embodied-agent/platform";
import { dataRoot } from "../../fs/deployment-path.js";
import { useRedisSessionStore } from "../../state/config.js";
import { redisDel, redisGetJson, redisSetJson } from "../../state/redis-session.js";

const FILE_NS = "web-auth-ephemeral";

type EphemeralRow<T> = {
  value: T;
  expires_at: number;
};

function ephemeralDir(): string {
  return resolve(dataRoot(), "auth", "ephemeral");
}

function ephemeralPath(namespace: string, key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  return resolve(ephemeralDir(), `${namespace}__${safeKey}.json`);
}

function readFileRow<T>(namespace: string, key: string): T | undefined {
  const path = ephemeralPath(namespace, key);
  if (!existsSync(path)) return undefined;
  try {
    const row = JSON.parse(readFileSync(path, "utf8")) as EphemeralRow<T>;
    if (!row || typeof row.expires_at !== "number") return undefined;
    if (Date.now() > row.expires_at) return undefined;
    return row.value;
  } catch {
    return undefined;
  }
}

function writeFileRow<T>(namespace: string, key: string, value: T, ttlSeconds: number): void {
  const path = ephemeralPath(namespace, key);
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteJson(path, {
    value,
    expires_at: Date.now() + ttlSeconds * 1000,
  } satisfies EphemeralRow<T>);
}

function deleteFileRow(namespace: string, key: string): void {
  const path = ephemeralPath(namespace, key);
  if (!existsSync(path)) return;
  try {
    unlinkSync(path);
  } catch {
    /* ignore */
  }
}

export async function ephemeralSetJson<T>(
  namespace: string,
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  if (useRedisSessionStore()) {
    await redisSetJson(namespace, key, value, ttlSeconds);
    return;
  }
  writeFileRow(namespace, key, value, ttlSeconds);
}

export async function ephemeralGetJson<T>(namespace: string, key: string): Promise<T | undefined> {
  if (useRedisSessionStore()) {
    return redisGetJson<T>(namespace, key);
  }
  return readFileRow<T>(namespace, key);
}

export async function ephemeralDel(namespace: string, key: string): Promise<void> {
  if (useRedisSessionStore()) {
    await redisDel(namespace, key);
    return;
  }
  deleteFileRow(namespace, key);
}

export function ephemeralUsesRedis(): boolean {
  return useRedisSessionStore();
}

export function ephemeralFileNamespace(): string {
  return FILE_NS;
}
