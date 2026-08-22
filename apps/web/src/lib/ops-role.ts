/** 场景工作台角色：来自 API session（admin / user）。模块缓存 + 订阅；UI 经 AuthContext 消费。 */

import { fetchAuthMe, logoutSession, type AuthMe, type WebAuthRole } from "../api/auth";

export type OpsRole = WebAuthRole;

let cachedAuth: AuthMe | null = null;
let authLoaded = false;
let fetchPromise: Promise<AuthMe | null> | null = null;
/** 递增以丢弃登录前发起的陈旧 /auth/me（in-flight 去重曾导致登录后 session 被 401 覆盖）。 */
let authFetchGeneration = 0;
let authVersion = 0;
const listeners = new Set<() => void>();

function bumpAuth(): void {
  authVersion += 1;
  for (const listener of listeners) {
    listener();
  }
}

/** useSyncExternalStore 订阅源：set/clear/refresh 后通知 React 重渲染。 */
export function subscribeOpsAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getOpsAuthVersion(): number {
  return authVersion;
}

export function getOpsRole(): OpsRole | null {
  return cachedAuth?.role ?? null;
}

export function getAuthUser(): AuthMe | null {
  return cachedAuth;
}

export function isAuthLoaded(): boolean {
  return authLoaded;
}

export function isAuthenticated(): boolean {
  return cachedAuth !== null;
}

export function isAdminOps(): boolean {
  return cachedAuth?.role === "admin";
}

export function canAccessPlatformBase(): boolean {
  return isAdminOps();
}

export function canShowAdminNav(): boolean {
  return isAdminOps();
}

export async function refreshOpsRole(): Promise<AuthMe | null> {
  const generation = authFetchGeneration;
  if (!fetchPromise) {
    fetchPromise = fetchAuthMe()
      .then((me) => {
        if (generation !== authFetchGeneration) return cachedAuth;
        cachedAuth = me;
        authLoaded = true;
        bumpAuth();
        return me;
      })
      .catch(() => {
        if (generation !== authFetchGeneration) return cachedAuth;
        cachedAuth = null;
        authLoaded = true;
        bumpAuth();
        return null;
      })
      .finally(() => {
        if (generation === authFetchGeneration) {
          fetchPromise = null;
        }
      });
  }
  return fetchPromise;
}

export function setOpsRoleFromAuth(me: AuthMe): void {
  authFetchGeneration += 1;
  fetchPromise = null;
  cachedAuth = me;
  authLoaded = true;
  bumpAuth();
}

export function clearOpsRole(): void {
  // 与 setOpsRoleFromAuth 对称：丢弃 in-flight /auth/me，避免登出后 200 写回缓存。
  authFetchGeneration += 1;
  fetchPromise = null;
  cachedAuth = null;
  authLoaded = true;
  bumpAuth();
}

export async function logoutOpsRole(): Promise<void> {
  try {
    await logoutSession();
  } finally {
    clearOpsRole();
  }
}
