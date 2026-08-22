import { createLogger } from "@embodied-agent/platform";
import { getEffectiveSettings } from "../../settings/store.js";

import { fetchNdviForPlot, listNdviPlots, type NdviCacheEntry } from "./ndvi.js";
import {
  domainPackCapabilitiesFromContract,
  getPrimaryDomainPackContract,
} from "../../domain-packs/loader.js";
import { getPlatformRuntimeContext } from "../../runtime/context.js";

const log = createLogger("ndvi");
let timer: ReturnType<typeof setInterval> | null = null;

export function activeDomainSupportsSatellite(): boolean {
  const settings = getEffectiveSettings();
  const contract = getPrimaryDomainPackContract(getPlatformRuntimeContext().loader, settings);
  return domainPackCapabilitiesFromContract(contract).satellite === true;
}

export function requireActiveSatelliteCapability(): void {
  if (!activeDomainSupportsSatellite()) {
    throw new Error("当前 active Domain Pack 未声明 satellite 能力。");
  }
}

export async function refreshAllNdviPlots(): Promise<NdviCacheEntry[]> {
  requireActiveSatelliteCapability();
  const plots = listNdviPlots();
  if (plots.length === 0) return [];
  const key = getEffectiveSettings().satellite_api_key?.trim();
  if (!key) {
    log.info("skip refresh: satellite_api_key not configured");
    return [];
  }
  const results: NdviCacheEntry[] = [];
  for (const plot of plots) {
    try {
      const entry = await fetchNdviForPlot(plot);
      results.push(entry);
      log.info("refreshed plot", {
        plot_id: plot.plot_id,
        ndvi_mean: entry.ndvi_mean.toFixed(2),
      });
    } catch (e) {
      log.warn("refresh failed", {
        plot_id: plot.plot_id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}

export function startNdviScheduler(): void {
  if (timer) return;
  if (!activeDomainSupportsSatellite()) {
    log.info("skip scheduler: active Domain Pack has no satellite capability", {
      active_domain: getEffectiveSettings().active_domain,
    });
    return;
  }
  const tick = () => {
    void refreshAllNdviPlots().catch((err) => {
      log.warn("ndvi refresh tick error", { error: String(err) });
    });
  };
  timer = setInterval(tick, 24 * 60 * 60 * 1000);
  void tick();
}

export function stopNdviScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
