import { useEffect, useId, useRef, useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { DomainPackProvider } from "../contexts/DomainPackContext";
import { SceneOpsReadinessProvider } from "../contexts/SceneOpsReadinessContext";
import { ConfirmDialog } from "../components/ops/ConfirmDialog";
import { Banner } from "../components/primitives/Banner";
import { resolvePackBySlug } from "../lib/domain-packs";
import { MOBILE_MQ } from "./scene-ops/utils";
import {
  NAV_GROUPS,
  NAV_ITEM_DEFS,
  USER_TAB_IDS,
  navItemFromDef,
  navItemFromOpsTab,
} from "./scene-ops/types";
import { useSceneOpsCatalog } from "./scene-ops/useSceneOpsCatalog";
import { useUnbind } from "./scene-ops/useUnbind";
import { SceneOpsGuard } from "./scene-ops/SceneOpsGuard";
import { SceneOpsHeader } from "./scene-ops/SceneOpsHeader";
import { SceneOpsTopbar } from "./scene-ops/SceneOpsTopbar";
import { SceneOpsSidebar } from "./scene-ops/SceneOpsSidebar";
import "../design/console.css";

/**
 * Domain Pack catalog/schema 唯一 fetch 来源（public + admin）。
 * 子树经 DomainPackProvider 消费，禁止页面级重复 fetchDomainPacks。
 */
export default function SceneOpsLayout() {
  const { packSlug = "" } = useParams<{ packSlug: string }>();
  const pack = resolvePackBySlug(packSlug);
  const { t } = useLanguage();
  const { loading: authLoading, isAdmin } = useAuth();
  const authReady = !authLoading;
  const adminNav = authReady && isAdmin;

  const {
    activeDomain,
    publicCatalog,
    catalog,
    activeOpsSchema,
    activeDomainError,
    catalogError,
    catalogLoading,
    adminError,
    adminLoading,
    reload,
  } = useSceneOpsCatalog();

  const { confirmUnbind, unbindError, onUnbindClick, onUnbindCancel, onUnbindConfirm } =
    useUnbind();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const sidebarId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <SceneOpsGuard
      pack={pack}
      catalogLoading={catalogLoading}
      catalogError={catalogError}
      publicCatalog={publicCatalog}
      activeDomain={activeDomain}
      activeDomainError={activeDomainError}
    >
      {(livePack) => {
        const controlHasProductUi = Boolean(
          activeOpsSchema?.navigation.tabs.some(
            (tab) => tab.id === "control" && tab.enabled && tab.widget_id,
          ),
        );

        const schemaNavItems =
          activeOpsSchema?.pack_id === livePack.packId
            ? activeOpsSchema.navigation.tabs
                .filter((tab) => tab.enabled)
                .filter((tab) => adminNav || USER_TAB_IDS.has(tab.id))
                .filter((tab) => tab.id !== "control" || controlHasProductUi)
                .map(navItemFromOpsTab)
            : null;
        const legacyNavItems = NAV_ITEM_DEFS.filter(
          (def) => def.legacy && (adminNav || def.userVisible),
        ).map(navItemFromDef);
        const navItems = schemaNavItems ?? legacyNavItems;

        const navGroups = NAV_GROUPS.map((group) => ({
          ...group,
          items: navItems
            .filter((item) => item.group === group.id)
            .sort((a, b) => a.order - b.order),
        })).filter((group) => group.items.length > 0);

        const base = livePack.opsPath;
        const packName = t(livePack.displayNameKey);
        const roleLabel = adminNav ? t("sceneOps.roleChipAdmin") : t("sceneOps.roleChipUser");

        return (
          <SceneOpsReadinessProvider scopeKey={livePack.slug}>
            <DomainPackProvider
              pack={livePack}
              publicCatalog={publicCatalog}
              catalog={catalog}
              activeDomain={activeDomain}
              activeDomainError={activeDomainError}
              activeOpsSchema={activeOpsSchema}
              error={catalogError}
              loading={catalogLoading}
              adminError={adminError}
              adminLoading={adminLoading}
              reload={reload}
            >
              <div className="ops-console-root">
                <div className="app-shell console-shell">
                  <SceneOpsHeader
                    drawerOpen={drawerOpen}
                    setDrawerOpen={setDrawerOpen}
                    sidebarId={sidebarId}
                    toggleRef={toggleRef}
                  />
                  <SceneOpsTopbar
                    packName={packName}
                    adminNav={adminNav}
                    roleLabel={roleLabel}
                    base={base}
                    onUnbindClick={onUnbindClick}
                  />
                  <div className="console-frame">
                    <SceneOpsSidebar
                      base={base}
                      navGroups={navGroups}
                      drawerOpen={drawerOpen}
                      setDrawerOpen={setDrawerOpen}
                      isMobile={isMobile}
                      sidebarId={sidebarId}
                      onUnbindClick={onUnbindClick}
                    />
                    <main
                      className="console-main"
                      {...(isMobile && drawerOpen ? { inert: true } : {})}
                    >
                      <Outlet />
                    </main>
                  </div>
                </div>
              </div>
              <ConfirmDialog
                open={confirmUnbind}
                title={t("sceneOps.unbind.confirmTitle")}
                message={t("sceneOps.unbind.confirmBody")}
                confirmLabel={t("sceneOps.unbind.confirmAction")}
                cancelLabel={t("sceneOps.unbind.cancel")}
                danger
                onCancel={onUnbindCancel}
                onConfirm={() => {
                  void onUnbindConfirm();
                }}
              />
              {unbindError ? (
                <div className="ops-console-unbind-error" data-testid="ops-unbind-error">
                  <Banner variant="error">{t("sceneOps.unbind.unbindFailed")}</Banner>
                </div>
              ) : null}
            </DomainPackProvider>
          </SceneOpsReadinessProvider>
        );
      }}
    </SceneOpsGuard>
  );
}
