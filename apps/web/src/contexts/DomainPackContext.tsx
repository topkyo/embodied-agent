import { createContext, useContext, useMemo, type ReactNode } from "react";
import type {
  AdminDomainPackCatalogEntry,
  DomainPackOpsSchema,
  PublicDomainPackCatalogEntry,
} from "../api";
import type { LiveDomainPackMeta } from "../lib/domain-packs";

/**
 * Domain Pack 运行时 catalog + ops schema 共享层。
 * 在 ops 壳内由 SceneOpsLayout 唯一拉取 public +（admin 时）admin domain-packs，
 * 经 DomainPackProvider 下发；子树通过 hook 消费，禁止再独立 fetchDomainPacks。
 *
 * StartWechat 等在 Auth/ops layout 外的页面可保留独立 public fetch。
 */
export type DomainPackContextValue = {
  pack: LiveDomainPackMeta;
  /** Public runtime catalog（GET /domain-packs） */
  publicCatalog: PublicDomainPackCatalogEntry[];
  /**
   * 展示/表单用 catalog：admin 已加载时用 admin 条目（含 capabilities/readiness/ops_schema），
   * 否则用 public 条目映射的兼容形态。
   */
  catalog: AdminDomainPackCatalogEntry[];
  activeDomain: string | null;
  activeDomainError: string | null;
  activeOpsSchema: DomainPackOpsSchema | null;
  /** Public catalog 加载错误 */
  error: string | null;
  /** Public catalog 加载中 */
  loading: boolean;
  /** Admin /admin/domain-packs 错误（非 admin 时为 null） */
  adminError: string | null;
  /** Admin catalog/schema 加载中（非 admin 时为 false） */
  adminLoading: boolean;
  /** 重新拉取 public；若当前为 admin 则同时拉取 admin domain-packs */
  reload: () => Promise<void>;
};

const DomainPackContext = createContext<DomainPackContextValue | null>(null);

const noopReload = async () => {};

export type DomainPackProviderProps = {
  pack: LiveDomainPackMeta;
  children: ReactNode;
  /** 以下字段由 SceneOpsLayout 注入；单元测试可只传 pack */
  publicCatalog?: PublicDomainPackCatalogEntry[];
  catalog?: AdminDomainPackCatalogEntry[];
  activeDomain?: string | null;
  activeDomainError?: string | null;
  activeOpsSchema?: DomainPackOpsSchema | null;
  error?: string | null;
  loading?: boolean;
  adminError?: string | null;
  adminLoading?: boolean;
  reload?: () => Promise<void>;
};

export function DomainPackProvider({
  pack,
  children,
  publicCatalog = [],
  catalog = [],
  activeDomain = null,
  activeDomainError = null,
  activeOpsSchema = null,
  error = null,
  loading = false,
  adminError = null,
  adminLoading = false,
  reload = noopReload,
}: DomainPackProviderProps) {
  const resolvedSchema = activeOpsSchema;
  const value = useMemo<DomainPackContextValue>(
    () => ({
      pack,
      publicCatalog,
      catalog,
      activeDomain,
      activeDomainError,
      activeOpsSchema: resolvedSchema,
      error,
      loading,
      adminError,
      adminLoading,
      reload,
    }),
    [
      pack,
      publicCatalog,
      catalog,
      activeDomain,
      activeDomainError,
      resolvedSchema,
      error,
      loading,
      adminError,
      adminLoading,
      reload,
    ],
  );

  return <DomainPackContext.Provider value={value}>{children}</DomainPackContext.Provider>;
}

/** 完整 Domain Pack 共享状态（catalog / schema / reload） */
export function useDomainPackState(): DomainPackContextValue {
  const ctx = useContext(DomainPackContext);
  if (!ctx) {
    throw new Error("useDomainPackState outside DomainPackProvider");
  }
  return ctx;
}

export function useDomainPack(): LiveDomainPackMeta {
  return useDomainPackState().pack;
}

/** Active pack ops schema（admin 拉取；非 admin 为 null） */
export function useOpsSchema(): DomainPackOpsSchema | null {
  return useDomainPackState().activeOpsSchema;
}

/**
 * 兼容旧 useActiveOpsSchema：schema + loading/error + reload，
 * 不再独立 fetchDomainPacks。
 */
export function useActiveOpsSchema(): {
  schema: DomainPackOpsSchema | null;
  error: string;
  loading: boolean;
  reload: () => Promise<void>;
} {
  const { activeOpsSchema, adminError, adminLoading, reload } = useDomainPackState();
  return {
    schema: activeOpsSchema,
    error: adminError ?? "",
    loading: adminLoading,
    reload,
  };
}
