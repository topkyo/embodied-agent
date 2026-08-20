import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { UserRole } from "@embodied-agent/safety";
import { atomicWriteJson } from "@embodied-agent/platform";
import { dataRoot } from "../fs/deployment-path.js";
import { withFileLock } from "../fs/file-lock.js";

export type UserRecord = {
  user_id: string;
  role: UserRole;
  deployment_id: string;
  display_name?: string;
};

const VALID_ROLES = new Set<UserRole>(["owner", "operator", "worker", "viewer", "readonly"]);

function usersPath(): string {
  return resolve(dataRoot(), "users.json");
}

function usersLockPath(): string {
  return resolve(dataRoot(), "users.json.lock");
}

export function loadUsersMap(): Record<string, UserRecord> {
  const path = usersPath();
  if (!existsSync(path)) {
    throw new Error(`${path} 不存在，请先显式配置 users.json`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, UserRecord>;
}

export function saveUsersMap(map: Record<string, UserRecord>): void {
  atomicWriteJson(usersPath(), map);
}

export function listUsers(): UserRecord[] {
  return Object.values(loadUsersMap()).sort((a, b) => a.user_id.localeCompare(b.user_id));
}

function assertValidUser(record: UserRecord): void {
  if (!record.user_id?.trim()) {
    throw new Error("user_id 不能为空");
  }
  if (!VALID_ROLES.has(record.role)) {
    throw new Error(`无效角色: ${record.role}`);
  }
  if (!record.deployment_id?.trim()) {
    throw new Error("deployment_id 不能为空");
  }
}

function bumpUsersCache(): void {
  void import("./users.js").then((m) => m.invalidateUsersCache());
}

function upsertUserUnlocked(record: UserRecord): UserRecord {
  assertValidUser(record);
  const map = loadUsersMap();
  const next: UserRecord = {
    user_id: record.user_id.trim(),
    role: record.role,
    deployment_id: record.deployment_id.trim(),
    display_name: record.display_name?.trim() || undefined,
  };
  map[next.user_id] = next;
  saveUsersMap(map);
  bumpUsersCache();
  return next;
}

function deleteUserUnlocked(user_id: string): boolean {
  const map = loadUsersMap();
  if (!map[user_id]) return false;
  const owners = Object.values(map).filter((u) => u.role === "owner");
  if (map[user_id]!.role === "owner" && owners.length <= 1) {
    throw new Error("不能删除最后一个 owner 账号");
  }
  delete map[user_id];
  saveUsersMap(map);
  bumpUsersCache();
  return true;
}

export async function upsertUser(record: UserRecord): Promise<UserRecord> {
  return withFileLock(usersLockPath(), () => upsertUserUnlocked(record));
}

export async function deleteUser(user_id: string): Promise<boolean> {
  return withFileLock(usersLockPath(), () => deleteUserUnlocked(user_id));
}
