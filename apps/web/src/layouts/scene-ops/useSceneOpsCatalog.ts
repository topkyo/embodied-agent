import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  fetchDomainPacks,
  fetchPublicDomainPacks,
  type AdminDomainPackCatalogEntry,
  type DomainPackOpsSchema,
  type PublicDomainPackCatalogEntry,
} from "../../api";
import { publicToAdminCatalog } from "./utils";

type LoadOpts = {
  cancelled?: boolean;
  /** 已有数据时静默刷新，避免壳层整页切到 checking */
  silent?: boolean;
};

export function useSceneOpsCatalog() {
  const { loading: authLoading, isAdmin } = useAuth();
  const authReady = !authLoading;
  const adminNav = authReady && isAdmin;

  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [publicCatalog, setPublicCatalog] = useState<PublicDomainPackCatalogEntry[]>([]);
  const [adminCatalog, setAdminCatalog] = useState<AdminDomainPackCatalogEntry[]>([]);
  const [activeOpsSchema, setActiveOpsSchema] = useState<DomainPackOpsSchema | null>(null);
  const [activeDomainError, setActiveDomainError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  const loadPublic = useCallback(async (opts: LoadOpts = {}) => {
    if (!opts.silent) setCatalogLoading(true);
    setCatalogError(null);
    try {
      const packs = await fetchPublicDomainPacks();
      if (opts.cancelled) return;
      setPublicCatalog(packs.catalog);
      setActiveDomain(packs.active_domain?.trim() || null);
    } catch (e) {
      if (opts.cancelled) return;
      setCatalogError(e instanceof Error ? e.message : String(e));
      setPublicCatalog([]);
      setActiveDomain(null);
    } finally {
      if (!opts.cancelled) setCatalogLoading(false);
    }
  }, []);

  const loadAdmin = useCallback(
    async (opts: LoadOpts = {}) => {
      if (!authReady || !adminNav) {
        if (opts.cancelled) return;
        setActiveOpsSchema(null);
        setActiveDomainError(null);
        setAdminCatalog([]);
        setAdminError(null);
        setAdminLoading(false);
        return;
      }
      setAdminLoading(true);
      setAdminError(null);
      try {
        const packs = await fetchDomainPacks();
        if (opts.cancelled) return;
        setAdminCatalog(packs.catalog);
        setActiveOpsSchema(
          packs.active_ops_schema ??
            packs.catalog.find((entry) => entry.active)?.ops_schema ??
            null,
        );
        setActiveDomainError(packs.active_error ?? null);
        if (packs.active_domain?.trim()) {
          setActiveDomain(packs.active_domain.trim());
        }
      } catch (e) {
        if (opts.cancelled) return;
        setActiveOpsSchema(null);
        setAdminCatalog([]);
        setAdminError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!opts.cancelled) setAdminLoading(false);
      }
    },
    [authReady, adminNav],
  );

  const reload = useCallback(async () => {
    await loadPublic({ silent: true });
    await loadAdmin({ silent: true });
  }, [loadPublic, loadAdmin]);

  useEffect(() => {
    const opts: LoadOpts = { cancelled: false };
    void loadPublic(opts);
    return () => {
      opts.cancelled = true;
    };
  }, [loadPublic]);

  useEffect(() => {
    const opts: LoadOpts = { cancelled: false };
    void loadAdmin(opts);
    return () => {
      opts.cancelled = true;
    };
  }, [loadAdmin]);

  const catalog = useMemo(
    () => (adminCatalog.length > 0 ? adminCatalog : publicToAdminCatalog(publicCatalog)),
    [adminCatalog, publicCatalog],
  );

  return {
    activeDomain,
    publicCatalog,
    adminCatalog,
    activeOpsSchema,
    activeDomainError,
    catalogError,
    catalogLoading,
    adminError,
    adminLoading,
    catalog,
    reload,
  };
}
