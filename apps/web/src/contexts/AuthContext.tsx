import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { AuthMe } from "../api/auth";
import {
  getAuthUser,
  getOpsAuthVersion,
  isAuthLoaded,
  logoutOpsRole,
  refreshOpsRole,
  subscribeOpsAuth,
} from "../lib/ops-role";

export interface AuthContextValue {
  user: AuthMe | null;
  loading: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Auth 真源仍在 `lib/ops-role` 模块缓存；Provider 经 useSyncExternalStore 订阅变更，
 * 使 setOpsRoleFromAuth / refresh / logout 后自动重渲染（无需 sessionTick）。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const version = useSyncExternalStore(subscribeOpsAuth, getOpsAuthVersion, getOpsAuthVersion);
  void version;

  const user = getAuthUser();
  const loaded = isAuthLoaded();

  const refresh = useCallback(async () => {
    await refreshOpsRole();
  }, []);

  const logout = useCallback(async () => {
    await logoutOpsRole();
  }, []);

  // 挂载时校验 session；已有缓存时仍 revalidate（refreshOpsRole 去重 in-flight）
  useEffect(() => {
    void refreshOpsRole();
  }, []);

  // 切回标签页时静默刷新 session
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshOpsRole();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading: !loaded,
      isAdmin: user?.role === "admin",
      refresh,
      logout,
    }),
    [user, loaded, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth outside AuthProvider");
  }
  return ctx;
}
