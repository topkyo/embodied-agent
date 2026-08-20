import { createLogger } from "@embodied-agent/platform";
import { createClient, type RedisClientType } from "redis";

import { requireRedisUrl } from "./config.js";

const log = createLogger("redis");
let client: RedisClientType | null = null;
let connectPromise: Promise<RedisClientType> | null = null;

const CONNECT_RETRIES = 8;
const CONNECT_DELAY_MS = 500;

async function connectWithRetry(): Promise<RedisClientType> {
  const url = requireRedisUrl();
  let lastErr: unknown;
  for (let attempt = 1; attempt <= CONNECT_RETRIES; attempt++) {
    const c = createClient({ url });
    c.on("error", (err) => {
      log.error("client error", { error: String(err) });
    });
    try {
      await c.connect();
      client = c as RedisClientType;
      return client;
    } catch (err) {
      lastErr = err;
      try {
        await c.quit();
      } catch {
        /* ignore */
      }
      if (attempt < CONNECT_RETRIES) {
        await new Promise((r) => setTimeout(r, CONNECT_DELAY_MS));
      }
    }
  }
  throw lastErr;
}

export async function getRedisClient(): Promise<RedisClientType> {
  if (client?.isOpen) return client;
  if (!connectPromise) {
    connectPromise = connectWithRetry();
  }
  return connectPromise;
}

export function resetRedisClientForTests(): void {
  client = null;
  connectPromise = null;
}
