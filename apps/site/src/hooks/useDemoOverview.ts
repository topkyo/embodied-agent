import { useEffect, useState } from "react";
import type { AdminOverviewEntity } from "../api/settings.js";
import { fetchDemoOverview } from "../api/demo-fetch.js";
import type { DemoSceneSlug } from "../demo/config.js";
import { hasDemoApiConfigured } from "../demo/config.js";
import { hasGreenhouseTelemetry } from "../lib/greenhouse-telemetry";

export type DemoTelemetryMode = "loading" | "live" | "stale" | "unavailable" | "unconfigured";

export function pickDemoEntity(
  scene: DemoSceneSlug,
  entities: AdminOverviewEntity[],
): AdminOverviewEntity | null {
  if (scene === "greenhouse") {
    return (
      entities.find((g) => g.entity_id === "gh-001" && hasGreenhouseTelemetry(g)) ??
      entities.find((g) => hasGreenhouseTelemetry(g)) ??
      null
    );
  }
  if (scene === "industrial") {
    return (
      entities.find((e) => e.entity_id === "cabinet-001") ??
      entities.find((e) => e.domain_id === "industrial") ??
      null
    );
  }
  return (
    entities.find((e) => e.entity_id === "m20-001") ??
    entities.find((e) => e.domain_id === "robotics") ??
    null
  );
}

/**
 * Single overview fetch for a demo scene (VITE_DEMO_API_* + DEMO_READONLY).
 * Greenhouse page uses this once and passes results into Hero + DemoPanel.
 */
export function useDemoOverview(sceneSlug: DemoSceneSlug, enabled = true) {
  const [entity, setEntity] = useState<AdminOverviewEntity | null>(null);
  const [mode, setMode] = useState<DemoTelemetryMode>(() =>
    enabled && hasDemoApiConfigured(sceneSlug) ? "loading" : "unconfigured",
  );

  useEffect(() => {
    if (!enabled) return;

    if (!hasDemoApiConfigured(sceneSlug)) {
      setEntity(null);
      setMode("unconfigured");
      return;
    }

    let cancelled = false;
    setMode("loading");

    void fetchDemoOverview(sceneSlug)
      .then((overview) => {
        if (cancelled) return;
        const picked = pickDemoEntity(sceneSlug, overview.entities);
        if (!picked) {
          setEntity(null);
          setMode("unavailable");
          return;
        }
        setEntity(picked);
        setMode(picked.stale ? "stale" : "live");
      })
      .catch(() => {
        if (!cancelled) {
          setEntity(null);
          setMode("unavailable");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sceneSlug, enabled]);

  return { entity, mode };
}
