import { resolve } from "node:path";
import { resolveAgentDataDir } from "@embodied-agent/platform";

export type StateBackend = "file" | "redis";

export function stateBackend(): StateBackend {
  const raw = process.env.STATE_BACKEND?.trim().toLowerCase();
  if (!raw) return "file";
  if (raw === "file") return "file";
  if (raw === "redis") return "redis";
  throw new Error(`STATE_BACKEND 只能是 file 或 redis，当前为：${process.env.STATE_BACKEND}`);
}

export function useRedisSessionStore(): boolean {
  return stateBackend() === "redis";
}

export type CommandStoreBackend = "file" | "sqlite";

/** 指令持久化后端，可与 STATE_BACKEND 解耦（dev 可 file 会话 + sqlite 指令）。 */
export function commandStoreBackend(): CommandStoreBackend {
  const raw = process.env.COMMAND_STORE?.trim().toLowerCase();
  if (!raw) return stateBackend() === "redis" ? "sqlite" : "file";
  if (raw === "sqlite") return "sqlite";
  if (raw === "file") return "file";
  throw new Error(`COMMAND_STORE 只能是 file 或 sqlite，当前为：${process.env.COMMAND_STORE}`);
}

export function useSqliteCommandStore(): boolean {
  return commandStoreBackend() === "sqlite";
}

export function requireRedisUrl(): string {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    throw new Error("STATE_BACKEND=redis 需要显式配置 REDIS_URL（无隐式回退）");
  }
  return url;
}

export function sqlitePath(): string {
  const explicit = process.env.SQLITE_PATH?.trim();
  if (explicit) return resolve(explicit);
  return resolve(resolveAgentDataDir(), "agent.db");
}

export function sessionKeyPrefix(deployment_id: string): string {
  return `tenant:${deployment_id}`;
}
