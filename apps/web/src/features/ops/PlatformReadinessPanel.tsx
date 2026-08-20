import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { fetchPlatformReadiness, type PlatformReadiness } from "../../api";
import { PanelTitle } from "../../components/primitives/PanelTitle";
import { useLanguage } from "../../contexts/LanguageContext";
import { useDomainPack } from "../../contexts/DomainPackContext";
import { humanizeReadinessDetail, humanizeReadinessTitle } from "../../lib/format-display";

type SummaryItem = {
  id: string;
  ok: boolean;
  title: string;
  detail: string;
  href?: string;
};

function buildSummaries(
  data: PlatformReadiness,
  t: (key: string, vars?: Record<string, string>) => string,
  devicesPath: string,
): SummaryItem[] {
  const items: SummaryItem[] = [];
  for (const check of data.checks) {
    if (check.ok && check.severity !== "error") continue;
    if (check.ok) continue;
    const id = check.id;
    // Skip sim matrix / absolute path noise on primary summary
    if (/sim_matrix|eval-reports|\//i.test(check.detail) && /sim|matrix|report/i.test(id)) {
      continue;
    }
    // Skip raw transport if mqtt already covered; hide path-like dumps
    if (isPathLike(check.detail)) continue;

    const title = humanizeReadinessTitle(
      { id: check.id, label: check.label, detail: check.detail },
      t,
    );
    const rawDetail = humanizeReadinessDetail(
      { id: check.id, label: check.label, detail: check.detail },
      t,
    );
    const detail = rawDetail.length > 160 ? `${rawDetail.slice(0, 160)}…` : rawDetail;

    const isNodes = /node|Nodes/i.test(id) || /\bnode/i.test(check.label);
    const isRegistry = /registry|domain_registry/i.test(id) || /registry/i.test(check.label);
    const isMqtt = /mqtt|transport|Transport/i.test(id) || /mqtt|transport/i.test(check.label);

    items.push({
      id,
      ok: false,
      title,
      detail: isMqtt ? t("sceneOps.readiness.summary.mqttDetail") : detail,
      href: isNodes || isRegistry ? devicesPath : undefined,
    });
  }

  // Deduplicate by title
  const seen = new Set<string>();
  return items
    .filter((item) => {
      if (seen.has(item.title)) return false;
      seen.add(item.title);
      return true;
    })
    .slice(0, 5);
}

function isPathLike(text: string): boolean {
  return text.includes("/Users/") || text.includes("eval-reports") || text.includes("agentstack");
}

/** 安装员可读的健康摘要；完整探针进「高级诊断」。 */
export function PlatformReadinessPanel() {
  const { t } = useLanguage();
  const pack = useDomainPack();
  const [data, setData] = useState<PlatformReadiness | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchPlatformReadiness());
    } catch (e) {
      setError(e instanceof Error ? e.message : "platform_readiness_failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const devicesPath = `${pack.opsPath}/devices`;
  const summaries = data ? buildSummaries(data, t, devicesPath) : [];
  const blockingIssues = data
    ? [
        ...data.checks
          .filter((check) => !check.ok && check.severity === "error")
          .map((check) => ({ code: check.id, message: check.detail })),
        ...data.runtime_issues
          .filter((issue) => issue.severity === "error")
          .map((issue) => ({ code: issue.code, message: issue.message })),
      ]
    : [];

  return (
    <section className="settings-panel platform-readiness-panel">
      <PanelTitle
        icon={<ShieldCheck size={20} aria-hidden />}
        title={t("sceneOps.readiness.productTitle")}
        text={t("sceneOps.readiness.productLead")}
      />
      <div className="settings-actions settings-actions-flush">
        <button type="button" className="btn btn-ghost" onClick={load} disabled={loading}>
          <RefreshCw size={16} aria-hidden />
          {loading ? t("sceneOps.readiness.refreshing") : t("sceneOps.readiness.refresh")}
        </button>
      </div>
      {error && <p className="muted">{t("console.schema.readinessError", { error })}</p>}
      {data && (
        <>
          <div className={`console-banner ${data.ready ? "ok" : "warn"}`}>
            {data.ready ? (
              <CheckCircle2 size={18} aria-hidden />
            ) : (
              <XCircle size={18} aria-hidden />
            )}
            <strong>
              {data.ready
                ? t("sceneOps.readiness.human.ready")
                : t("sceneOps.readiness.human.blocked")}
            </strong>
            <span className="muted u-text-sm">
              {data.deployment_id} · {data.active_domain}
            </span>
          </div>

          {data.ready ? (
            <p className="muted u-text-sm">{t("sceneOps.readiness.summary.allGood")}</p>
          ) : (
            <ul className="readiness-action-list">
              {summaries.map((item) => (
                <li key={item.id} className="readiness-action-item">
                  <strong>{item.title}</strong>
                  <span className="muted u-text-sm">{item.detail}</span>
                  {item.href && (
                    <Link className="link-accent-sm" to={item.href}>
                      {item.href.includes("devices")
                        ? t("sceneOps.readiness.cta.devices")
                        : t("sceneOps.readiness.cta.fixConfig")}
                    </Link>
                  )}
                </li>
              ))}
              {summaries.length === 0 && (
                <li className="readiness-action-item">
                  <strong>{t("sceneOps.readiness.human.blocked")}</strong>
                  <span className="muted u-text-sm">
                    {t("sceneOps.readiness.summary.openDiagnostics")}
                  </span>
                </li>
              )}
            </ul>
          )}

          <details className="ops-platform-details readiness-diagnostics">
            <summary className="ops-platform-details-summary">
              {t("sceneOps.readiness.diagnostics")}
            </summary>
            <p className="muted ops-platform-details-lead">
              {t("sceneOps.readiness.diagnosticsLead")}
            </p>
            <div className="console-status-grid readiness-check-grid">
              {data.checks.map((check) => (
                <div
                  key={check.id}
                  className={`console-status-card ${check.ok ? "ok" : check.severity}`}
                >
                  {check.ok ? (
                    <CheckCircle2 size={18} aria-hidden />
                  ) : (
                    <XCircle size={18} aria-hidden />
                  )}
                  <span>{check.label}</span>
                  <strong title={isPathLike(check.detail) ? check.id : check.detail}>
                    {isPathLike(check.detail)
                      ? t("sceneOps.readiness.summary.pathHidden")
                      : check.detail.length > 80
                        ? `${check.detail.slice(0, 80)}…`
                        : check.detail}
                  </strong>
                </div>
              ))}
            </div>
            {blockingIssues.length > 0 && (
              <div className="readiness-issues">
                {blockingIssues.slice(0, 12).map((issue) => (
                  <p key={`${issue.code}:${issue.message.slice(0, 40)}`}>
                    <strong>{issue.code}</strong>{" "}
                    {isPathLike(issue.message)
                      ? t("sceneOps.readiness.summary.pathHidden")
                      : issue.message.length > 120
                        ? `${issue.message.slice(0, 120)}…`
                        : issue.message}
                  </p>
                ))}
              </div>
            )}
          </details>
        </>
      )}
    </section>
  );
}
