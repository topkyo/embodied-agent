import { useEffect, useRef, useState, type ReactNode } from "react";
import { Thermometer } from "lucide-react";
import type { AdminOverview } from "../../api";
import type { useLanguage } from "../../contexts/LanguageContext";
import {
  greenhouseMetricNumber,
  greenhouseMetricString,
  hasGreenhouseTelemetry,
} from "../../lib/greenhouse-telemetry";

type AgricultureOverviewPanelProps = {
  overview: AdminOverview;
  t: ReturnType<typeof useLanguage>["t"];
};

function FlashMetric({ value, children }: { value: string; children: ReactNode }) {
  const prevRef = useRef<string | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (prevRef.current !== null && prevRef.current !== value) {
      setFlash(true);
      const id = window.setTimeout(() => setFlash(false), 650);
      prevRef.current = value;
      return () => window.clearTimeout(id);
    }
    prevRef.current = value;
  }, [value]);

  return <strong className={flash ? "greenhouse-metric--flash" : undefined}>{children}</strong>;
}

export function AgricultureOverviewPanel({ overview, t }: AgricultureOverviewPanelProps) {
  if (overview.entities.length === 0) return null;

  return (
    <div className="greenhouse-grid">
      {overview.entities.map((gh) => {
        const temp =
          greenhouseMetricNumber(gh, "temperature_c") != null
            ? `${greenhouseMetricNumber(gh, "temperature_c")!.toFixed(1)}°C`
            : "—";
        const humidity =
          greenhouseMetricNumber(gh, "humidity_percent") != null
            ? `${greenhouseMetricNumber(gh, "humidity_percent")!.toFixed(0)}%`
            : "—";
        const vent = greenhouseMetricString(gh, "vent_status") ?? "—";
        const fan = greenhouseMetricString(gh, "fan_status") ?? "—";

        return (
          <article key={gh.entity_id} className={`greenhouse-card${gh.stale ? " stale" : ""}`}>
            <header>
              <Thermometer size={18} aria-hidden />
              <strong>{gh.name ?? gh.entity_id}</strong>
              <span className={gh.stale ? "pill pill--warn" : "pill pill--ok"}>
                {gh.stale ? t("console.overview.stale") : t("console.overview.live")}
              </span>
            </header>
            {hasGreenhouseTelemetry(gh) ? (
              <div className="greenhouse-readings">
                <div>
                  <FlashMetric value={temp}>{temp}</FlashMetric>
                  <span>{t("landing.sensor.temp")}</span>
                </div>
                <div>
                  <FlashMetric value={humidity}>{humidity}</FlashMetric>
                  <span>{t("landing.sensor.humidity")}</span>
                </div>
                <div>
                  <FlashMetric value={vent}>{vent}</FlashMetric>
                  <span>{t("console.overview.vent")}</span>
                </div>
                <div>
                  <FlashMetric value={fan}>{fan}</FlashMetric>
                  <span>{t("console.overview.fan")}</span>
                </div>
              </div>
            ) : (
              <p className="muted u-text-sm">{t("console.overview.noTelemetry")}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
