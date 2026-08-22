import { useMemo } from "react";
import type { AdminOverviewEntity } from "../api";
import { DEMO_CONVERSATIONS } from "../demo/conversations.js";
import type { DemoSceneSlug } from "../demo/config.js";
import { type DemoTelemetryMode, useDemoOverview } from "../hooks/useDemoOverview";
import { greenhouseMetricNumber } from "../lib/greenhouse-telemetry";
import WechatClawbotPanel from "./primitives/WechatClawbotPanel";
import type { ProofPanelStatus } from "./primitives/ProofPanel";
import { useLanguage } from "../contexts/LanguageContext";

type DemoPanelProps = {
  sceneSlug: DemoSceneSlug;
  /**
   * Parent-owned overview (e.g. greenhouse Hero). When set, skips internal fetch
   * so the page only hits DEMO_READONLY overview once.
   */
  overview?: {
    entity: AdminOverviewEntity | null;
    mode: DemoTelemetryMode;
  };
};

const PLACEHOLDER = "—";

function metricNumber(entity: AdminOverviewEntity | null, field: string): number | undefined {
  const value = entity?.telemetry?.[field];
  return typeof value === "number" ? value : undefined;
}

function statusToneForMode(mode: DemoTelemetryMode): ProofPanelStatus {
  if (mode === "live") return "live";
  if (mode === "stale") return "warn";
  return "muted";
}

function panelMetric(mode: DemoTelemetryMode, liveFormatted: string | null): string {
  if (mode === "loading") return PLACEHOLDER;
  return liveFormatted ?? PLACEHOLDER;
}

function DemoPanelSkeleton() {
  return (
    <div className="demo-panel-skeleton" aria-hidden>
      <div className="demo-panel-skeleton__meta">
        <span className="demo-panel-skeleton__bar" />
        <span className="demo-panel-skeleton__bar" />
      </div>
      <span className="demo-panel-skeleton__bar demo-panel-skeleton__bar--md" />
      <span className="demo-panel-skeleton__bar demo-panel-skeleton__bar--lg" />
      <span className="demo-panel-skeleton__bar demo-panel-skeleton__bar--md" />
      <span className="demo-panel-skeleton__bar demo-panel-skeleton__bar--lg" />
    </div>
  );
}

export default function DemoPanel({ sceneSlug, overview }: DemoPanelProps) {
  const { t } = useLanguage();
  const fetched = useDemoOverview(sceneSlug, overview == null);
  const entity = overview?.entity ?? fetched.entity;
  const mode = overview?.mode ?? fetched.mode;

  const metrics = useMemo(() => {
    if (sceneSlug === "greenhouse") {
      const temp = greenhouseMetricNumber(entity, "temperature_c");
      const humid = greenhouseMetricNumber(entity, "humidity_percent");
      return {
        primary: panelMetric(mode, temp != null ? `${temp.toFixed(1)}°C` : null),
        secondary: panelMetric(mode, humid != null ? `${humid.toFixed(0)}%` : null),
        entityLabel: entity?.entity_id ?? "gh-001",
      };
    }
    if (sceneSlug === "industrial") {
      const temp = metricNumber(entity, "temperature_c");
      return {
        primary: panelMetric(mode, temp != null ? `${temp.toFixed(1)}°C` : null),
        secondary: panelMetric(mode, t("demo.industrial.metric.fan")),
        entityLabel: entity?.entity_id ?? "cabinet-001",
      };
    }
    const online = entity?.stale === false;
    return {
      primary: panelMetric(
        mode,
        online ? t("demo.robot.metric.online") : t("demo.robot.metric.offline"),
      ),
      secondary: panelMetric(mode, t("demo.robot.metric.motion")),
      entityLabel: entity?.entity_id ?? "m20-001",
    };
  }, [entity, mode, sceneSlug, t]);

  const statusLabel =
    mode === "loading"
      ? t("landing.console.statusLoading")
      : mode === "live"
        ? t("landing.console.status")
        : mode === "stale"
          ? t("landing.console.statusStale")
          : mode === "unconfigured"
            ? t("demo.status.unconfigured")
            : t("console.overview.noTelemetry");

  const replayVars: Record<string, string> =
    sceneSlug === "greenhouse"
      ? { temp: metrics.primary, humid: metrics.secondary }
      : sceneSlug === "industrial"
        ? { temp: metrics.primary }
        : { entity: metrics.entityLabel };

  const replayMessages = DEMO_CONVERSATIONS[sceneSlug].map((msg) => ({
    role: msg.role,
    text: t(msg.textKey, replayVars),
  }));

  return (
    <section className="scene-section alt" id="demo">
      <p className="eyebrow">{t("demo.eyebrow")}</p>
      <h2 className="section-title">{t("demo.title")}</h2>
      <p className="sub">{t("demo.lead")}</p>
      <div className="trio-card demo-panel-card">
        {mode === "loading" ? (
          <DemoPanelSkeleton />
        ) : (
          <WechatClawbotPanel
            title={t(`demo.panel.title.${sceneSlug}`)}
            statusLabel={statusLabel}
            statusTone={statusToneForMode(mode)}
            entityLabel={metrics.entityLabel}
            temp={metrics.primary}
            humid={metrics.secondary}
            messages={replayMessages}
            disclaimer={t("demo.disclaimer")}
          />
        )}
        {mode === "unconfigured" ? (
          <p className="muted demo-panel-foot">{t("demo.status.unconfiguredHint")}</p>
        ) : null}
      </div>
    </section>
  );
}
