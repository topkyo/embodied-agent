import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOverview, type AdminOverview } from "../../api";
import { useLanguage } from "../../contexts/LanguageContext";
import { getDeploymentDisplayName } from "../../i18n";
import { useDomainPack, useOpsSchema } from "../../contexts/DomainPackContext";
import { OpsPageHeader } from "../../components/ops/OpsPageHeader";
import { AsyncState } from "../../components/ops/AsyncState";
import { Banner } from "../../components/primitives/Banner";
import { ActionFlowSection } from "../../features/ops/action-flow/ActionFlowSection";
import { ReadonlyOpsPanel } from "../../features/ops/ReadonlyOpsPanel";
import { useInterval } from "../../hooks/useInterval";
import { resolvePackOpsPanelsFromSchema } from "./pack-ops-registry";

const OVERVIEW_POLL_MS = 30_000;
/** 「刚刚更新」badge 展示时长 */
const JUST_UPDATED_MS = 3_000;

export default function SceneOpsOverview() {
  const { t } = useLanguage();
  const pack = useDomainPack();
  const panels = resolvePackOpsPanelsFromSchema(useOpsSchema(), "overview");
  const OverviewIcon = panels.overviewIcon;
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [justUpdated, setJustUpdated] = useState(false);
  const [focusExecuting, setFocusExecuting] = useState(false);
  /** 首次成功加载不闪 badge，仅后续轮询/重试提示「刚刚更新」 */
  const hadDataRef = useRef(false);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setOverview(await fetchOverview());
      if (hadDataRef.current) {
        setJustUpdated(true);
      } else {
        hadDataRef.current = true;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useInterval(() => void reload(), OVERVIEW_POLL_MS, { visibleOnly: true });

  useEffect(() => {
    if (!justUpdated) return;
    const id = window.setTimeout(() => setJustUpdated(false), JUST_UPDATED_MS);
    return () => window.clearTimeout(id);
  }, [justUpdated]);

  const deploymentName = getDeploymentDisplayName(overview?.deployment_name, t);
  const packName = t(pack.displayNameKey);
  const OverviewPanel = panels.OverviewPanel;

  return (
    <section className="settings settings-console">
      <OpsPageHeader
        title={t("sceneOps.overview.title")}
        subtitle={`${t("sceneOps.overview.lead")} · ${packName}${deploymentName ? ` · ${deploymentName}` : ""}`}
        icon={<OverviewIcon size={22} aria-hidden />}
        actions={
          <div className="ops-page-header__actions-cluster">
            <span className="ops-refresh-live" aria-live="polite">
              {justUpdated && overview ? (
                <span className="pill pill--info ops-refresh-badge">
                  {t("sceneOps.overview.justUpdated")}
                </span>
              ) : null}
            </span>
            <span className="ops-page-header__lockup-label muted">
              {t("sceneOps.overview.statusLockup")}
            </span>
          </div>
        }
      />

      <AsyncState
        loading={loading && !overview}
        error={overview ? null : error}
        onRetry={() => void reload()}
      >
        {error && overview ? (
          <div className="async-state async-state--error" aria-live="polite">
            <Banner variant="error">{error}</Banner>
            <div className="async-state__actions">
              <button type="button" className="btn btn--primary" onClick={() => void reload()}>
                {t("sceneOps.common.retry")}
              </button>
            </div>
          </div>
        ) : null}

        {overview ? (
          <ActionFlowSection
            pending={overview.pending_confirms ?? []}
            onFocusExecutingChange={setFocusExecuting}
          />
        ) : null}

        {OverviewPanel && overview ? (
          <div data-testid="pack-overview">
            <OverviewPanel overview={overview} t={t} executing={focusExecuting} />
          </div>
        ) : null}

        {panels.showGenericMetrics && overview && (
          <div className="overview-metrics">
            <span className="pill">
              {t("console.overview.pending")}: {overview.pending_confirms_count}
            </span>
            <span className="pill">
              {t("console.overview.alerts")}: {overview.active_alert_rules_count}
            </span>
          </div>
        )}

        {panels.showGenericNodes && overview && overview.nodes.length > 0 && (
          <section className="settings-panel ops-overview-nodes">
            <h2 className="ops-overview-nodes-title">{t("console.overview.nodes")}</h2>
            <ul className="ops-overview-nodes-list">
              {overview.nodes.map((n) => (
                <li key={n.node_id} className="ops-overview-nodes-item">
                  <span className={n.online ? "pill pill--ok" : "pill pill--warn"}>
                    {n.online
                      ? t("console.overview.nodeOnline")
                      : t("console.overview.nodeOffline")}
                  </span>{" "}
                  {n.node_id} ({n.entity_id ?? "—"}) — {n.status}
                </li>
              ))}
            </ul>
          </section>
        )}

        {panels.showReadonlyOps && <ReadonlyOpsPanel showCommands={false} />}
      </AsyncState>
    </section>
  );
}
