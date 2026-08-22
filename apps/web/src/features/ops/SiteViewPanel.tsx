import { MapPinned } from "lucide-react";
import type { AdminOverview, AdminOverviewEntity, SceneOutcomeRow } from "../../api";
import { PanelTitle } from "../../components/primitives/PanelTitle";
import { formatSceneSkillDisplayName } from "../../lib/format-display";

export type SiteViewTranslate = (key: string, params?: Record<string, string>) => string;

export type SiteViewPanelProps = {
  overview: AdminOverview;
  t: SiteViewTranslate;
  /** 可选近期 outcome；省略或空数组时轨迹显示「—」 */
  outcomes?: SceneOutcomeRow[];
  /** 焦点指令处于 execute 阶段时强调现场联动 */
  executing?: boolean;
};

type DeviceReading = {
  device_type?: string;
  metric?: string;
  value?: unknown;
};

function metricNumber(entity: AdminOverviewEntity | undefined, field: string): number | undefined {
  const value = entity?.telemetry?.[field];
  return typeof value === "number" ? value : undefined;
}

function fanStatus(entity: AdminOverviewEntity | undefined): string | undefined {
  const direct = entity?.telemetry?.fan_status ?? entity?.telemetry?.exhaust_status;
  if (typeof direct === "string" && direct.trim()) return direct;
  if (direct === 1) return "on";
  if (direct === 0) return "off";
  const readings = entity?.telemetry?.device_readings;
  if (!Array.isArray(readings)) return undefined;
  const reading = (readings as DeviceReading[]).find(
    (item) => item.device_type === "fan" && item.metric === "relay_state",
  );
  if (!reading || typeof reading.value !== "number") return undefined;
  return reading.value === 1 ? "on" : "off";
}

/** 优先 cabinet；否则取首个实体（跨 pack 复用时由调用方过滤也可）。 */
export function pickSiteViewEntity(
  entities: AdminOverviewEntity[],
): AdminOverviewEntity | undefined {
  return entities.find((e) => e.entity_type === "cabinet") ?? entities[0];
}

function dash(value: string | number | undefined | null): string {
  if (value == null) return "—";
  if (typeof value === "string" && !value.trim()) return "—";
  return String(value);
}

export function SiteViewPanel({ overview, t, outcomes, executing = false }: SiteViewPanelProps) {
  const entity = pickSiteViewEntity(overview.entities);
  const temp = metricNumber(entity, "temperature_c");
  const fan = fanStatus(entity);
  const alertLabel =
    overview.active_alert_rules_count > 0
      ? t("sceneOps.siteView.alertActive", { count: String(overview.active_alert_rules_count) })
      : null;
  const tempLabel = temp != null ? `${temp.toFixed(1)}°C` : "—";
  const fanLabel = dash(fan);
  const entityLabel = entity ? (entity.name ?? entity.entity_id) : "—";
  const trail = outcomes?.slice(0, 5) ?? [];

  return (
    <section
      className={`settings-panel site-view-panel${executing ? " site-view--focus-executing" : ""}`}
    >
      <PanelTitle
        icon={<MapPinned size={20} aria-hidden />}
        title={t("sceneOps.siteView.title")}
        text={t("sceneOps.siteView.lead")}
      />

      <div className="site-view-layout u-flex u-flex-wrap u-gap-md">
        <svg
          className="site-view-svg"
          viewBox="0 0 320 200"
          role="img"
          aria-label={t("sceneOps.siteView.svgLabel")}
        >
          <rect className="site-view-cabinet" x="40" y="36" width="180" height="128" rx="6" />
          <text className="site-view-label" x="130" y="28" textAnchor="middle">
            {entityLabel}
          </text>

          <circle
            className={temp != null ? "site-view-point site-view-point--live" : "site-view-point"}
            cx="100"
            cy="100"
            r="10"
          />
          <text className="site-view-label" x="100" y="128" textAnchor="middle">
            {t("sceneOps.siteView.temp")}
          </text>
          <text className="site-view-value" x="100" y="148" textAnchor="middle">
            {tempLabel}
          </text>

          <rect
            className={fan === "on" ? "site-view-fan site-view-fan--on" : "site-view-fan"}
            x="160"
            y="78"
            width="36"
            height="36"
            rx="4"
          />
          <text className="site-view-label" x="178" y="128" textAnchor="middle">
            {t("sceneOps.siteView.exhaust")}
          </text>
          <text className="site-view-value" x="178" y="148" textAnchor="middle">
            {fanLabel}
          </text>

          {alertLabel ? (
            <>
              <circle className="site-view-alert" cx="250" cy="56" r="12" />
              <text className="site-view-alert-text" x="250" y="60" textAnchor="middle">
                !
              </text>
              <text className="site-view-label" x="250" y="84" textAnchor="middle">
                {t("sceneOps.siteView.alert")}
              </text>
            </>
          ) : (
            <text className="site-view-label" x="250" y="60" textAnchor="middle">
              {t("sceneOps.siteView.alert")}: —
            </text>
          )}
        </svg>

        <div className="site-view-side">
          <p className="muted u-text-sm u-mb-sm">
            {t("sceneOps.siteView.status")}:{" "}
            {entity ? (
              <span className={entity.stale ? "pill pill--warn" : "pill pill--ok"}>
                {entity.stale ? t("console.overview.stale") : t("console.overview.live")}
              </span>
            ) : (
              "—"
            )}
          </p>
          {alertLabel ? <p className="u-text-sm u-mb-sm">{alertLabel}</p> : null}

          <h3 className="site-view-trail-title">{t("sceneOps.siteView.outcomes")}</h3>
          {trail.length === 0 ? (
            <p className="muted u-text-sm">—</p>
          ) : (
            <ul className="u-list-plain site-view-trail">
              {trail.map((row) => (
                <li key={`${row.ts}-${row.command_id ?? row.scene_skill_id}`}>
                  <span className="muted u-text-xs">{row.ts.slice(0, 16).replace("T", " ")}</span>
                  {" · "}
                  {formatSceneSkillDisplayName(row.scene_skill_id, t)}
                  {" · "}
                  {row.success
                    ? t("sceneOps.review.outcomes.ok")
                    : t("sceneOps.review.outcomes.fail")}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
