import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { UserRole } from "@embodied-agent/safety";
import { atomicWriteJson } from "@embodied-agent/platform";
import { dataRoot } from "../fs/deployment-path.js";
import { getUserStrict, invalidateUsersCache, type UserRecord } from "./users.js";

const VALID_ROLES = new Set<UserRole>(["owner", "operator", "worker", "viewer", "readonly"]);

function usersPath(): string {
  return resolve(dataRoot(), "users.json");
}

function loadUsersMapMutable(): Record<string, UserRecord> {
  const path = usersPath();
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, UserRecord>;
}

function saveUsersMap(map: Record<string, UserRecord>): void {
  const path = usersPath();
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteJson(path, map);
  invalidateUsersCache();
}

/**
 * 扫码绑定时 principal 允许自由填写：不存在则自动建档为 owner（显式用户动作，非隐式兜底）。
 */
export function ensurePrincipalUser(
  principalUserId: string,
  deploymentId: string,
  opts?: { role?: UserRole; displayName?: string },
): UserRecord {
  const userId = principalUserId.trim();
  const deployment = deploymentId.trim();
  if (!userId) {
    throw new Error("principal_user_id is required");
  }
  if (!deployment) {
    throw new Error("deployment_id is required to provision principal user");
  }
  let existing: UserRecord | undefined;
  try {
    existing = getUserStrict(userId);
  } catch {
    existing = undefined;
  }
  if (existing) return existing;

  const role = opts?.role ?? "owner";
  if (!VALID_ROLES.has(role)) {
    throw new Error(`invalid role for provision: ${role}`);
  }
  const record: UserRecord = {
    user_id: userId,
    role,
    deployment_id: deployment,
    display_name: opts?.displayName?.trim() || userId,
  };
  const map = loadUsersMapMutable();
  map[userId] = record;
  saveUsersMap(map);
  return record;
}
