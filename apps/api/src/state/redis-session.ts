import { getEffectiveSettings } from "../settings/store.js";
import { getRedisClient } from "./redis-client.js";
import { sessionKeyPrefix } from "./config.js";

const TTL_SECONDS = 15 * 60;

function deploymentSessionPrefix(): string {
  return sessionKeyPrefix(getEffectiveSettings().deployment_id);
}

export async function redisSetJson(
  namespace: string,
  key: string,
  value: unknown,
  ttlSeconds = TTL_SECONDS,
): Promise<void> {
  const client = await getRedisClient();
  const redisKey = `${deploymentSessionPrefix()}:${namespace}:${key}`;
  await client.set(redisKey, JSON.stringify(value), { EX: ttlSeconds });
}

export async function redisGetJson<T>(namespace: string, key: string): Promise<T | undefined> {
  const client = await getRedisClient();
  const redisKey = `${deploymentSessionPrefix()}:${namespace}:${key}`;
  const raw = await client.get(redisKey);
  if (!raw) return undefined;
  return JSON.parse(raw) as T;
}

export async function redisDel(namespace: string, key: string): Promise<void> {
  const client = await getRedisClient();
  const redisKey = `${deploymentSessionPrefix()}:${namespace}:${key}`;
  await client.del(redisKey);
}

async function scanKeysMatching(pattern: string): Promise<string[]> {
  const client = await getRedisClient();
  const keys: string[] = [];
  for await (const batch of client.scanIterator({
    MATCH: pattern,
    COUNT: 100,
  })) {
    for (const key of batch) {
      keys.push(key);
    }
  }
  return keys;
}

export async function redisListKeys(namespace: string, patternSuffix: string): Promise<string[]> {
  const pattern = `${deploymentSessionPrefix()}:${namespace}:${patternSuffix}`;
  return scanKeysMatching(pattern);
}

export async function redisListNamespaceEntries<T>(namespace: string): Promise<Map<string, T>> {
  const prefix = `${deploymentSessionPrefix()}:${namespace}:`;
  const fullKeys = await scanKeysMatching(`${prefix}*`);
  const client = await getRedisClient();
  const out = new Map<string, T>();
  for (const fullKey of fullKeys) {
    if (!fullKey.startsWith(prefix)) continue;
    const suffix = fullKey.slice(prefix.length);
    const raw = await client.get(fullKey);
    if (!raw) continue;
    out.set(suffix, JSON.parse(raw) as T);
  }
  return out;
}
