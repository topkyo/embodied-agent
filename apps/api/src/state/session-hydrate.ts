import { sessionUsesRedis } from "./session-backing.js";

let redisSessionsReady = false;

export function markRedisSessionsReady(): void {
  redisSessionsReady = true;
}

export function redisSessionsReadyForReads(): boolean {
  return !sessionUsesRedis() || redisSessionsReady;
}

export function assertRedisSessionsReady(op: string): void {
  if (sessionUsesRedis() && !redisSessionsReady) {
    throw new Error(
      `${op} 需要 await initStateBackend() 完成 Redis 会话 hydrate（STATE_BACKEND=redis）`,
    );
  }
}
