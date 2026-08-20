import { loadUsersMap, type UserRecord } from "./user-store.js";

export type { UserRecord } from "./user-store.js";

let cache: Record<string, UserRecord> | null = null;

export function invalidateUsersCache(): void {
  cache = null;
}

function usersMap(): Record<string, UserRecord> {
  if (!cache) {
    cache = loadUsersMap();
  }
  return cache;
}

export function getUsersMap(): Record<string, UserRecord> {
  return { ...usersMap() };
}

export function getUser(userId: string): UserRecord {
  const map = usersMap();
  const user = map[userId];
  if (!user) {
    throw new Error(`unknown user_id: ${userId}`);
  }
  return user;
}

export function getUserStrict(userId: string): UserRecord | undefined {
  return usersMap()[userId];
}
