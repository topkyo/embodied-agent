import { readFileSync, existsSync } from "node:fs";
import { getEffectiveSettings } from "../../settings/store.js";
import { atomicWriteJson } from "@embodied-agent/platform";
import { deploymentScopedPath } from "../../fs/deployment-path.js";

export type NdviPlotConfig = {
  plot_id: string;
  entity_id?: string;
  west: number;
  south: number;
  east: number;
  north: number;
};

export type NdviCacheEntry = {
  plot_id: string;
  ndvi_mean: number;
  observed_at: string;
  source: string;
};

function cachePath(deployment_id?: string): string {
  return deploymentScopedPath("ndvi-cache.json", deployment_id);
}

export function listNdviPlots(): NdviPlotConfig[] {
  const plots = getEffectiveSettings().satellite_plots ?? [];
  return plots.filter(
    (p) =>
      p.plot_id &&
      typeof p.west === "number" &&
      typeof p.south === "number" &&
      typeof p.east === "number" &&
      typeof p.north === "number",
  );
}

export function resolveNdviPlot(opts: { plot_id?: string; entity_id?: string }): NdviPlotConfig {
  const plots = listNdviPlots();
  if (plots.length === 0) {
    throw new Error("卫星遥感未配置：请在配置台填写 satellite_plots（地块 bbox）。");
  }
  if (opts.plot_id) {
    const hit = plots.find((p) => p.plot_id === opts.plot_id);
    if (!hit) throw new Error(`未找到地块 ${opts.plot_id} 的卫星配置。`);
    return hit;
  }
  if (opts.entity_id) {
    const hit = plots.find((p) => p.entity_id === opts.entity_id);
    if (!hit) throw new Error(`未找到 entity ${opts.entity_id} 的卫星地块配置。`);
    return hit;
  }
  throw new Error("请指定 plot_id 或 entity_id 后再查询卫星 NDVI。");
}

type NdviCacheFile = { entries: NdviCacheEntry[] };

function loadCache(deployment_id?: string): NdviCacheEntry[] {
  const path = cachePath(deployment_id);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as NdviCacheEntry[] | NdviCacheFile;
    if (Array.isArray(raw)) return raw;
    return Array.isArray(raw.entries) ? raw.entries : [];
  } catch {
    return [];
  }
}

function saveCache(entries: NdviCacheEntry[], deployment_id?: string): void {
  atomicWriteJson(cachePath(deployment_id), { entries });
}

export async function fetchNdviForPlot(plot: NdviPlotConfig): Promise<NdviCacheEntry> {
  const key = getEffectiveSettings().satellite_api_key?.trim();
  if (!key) {
    const cached = loadCache().find((e) => e.plot_id === plot.plot_id);
    if (cached) return cached;
    throw new Error(
      "卫星 NDVI 未配置 API Key：请填写 satellite_api_key，或由管理员更新 ndvi-cache.json。",
    );
  }

  const centerLat = (plot.south + plot.north) / 2;
  const centerLng = (plot.west + plot.east) / 2;
  const url = new URL("https://services.sentinel-hub.com/api/v1/statistics");
  url.searchParams.set("evalscript", "ndvi");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bbox: [plot.west, plot.south, plot.east, plot.north],
      center: { lat: centerLat, lng: centerLng },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`卫星 NDVI 请求失败：${res.status} ${body.slice(0, 120)}`);
  }
  const payload = (await res.json()) as { ndvi_mean?: number; mean?: number };
  const entry: NdviCacheEntry = {
    plot_id: plot.plot_id,
    ndvi_mean: payload.ndvi_mean ?? payload.mean ?? 0,
    observed_at: new Date().toISOString(),
    source: "sentinel-hub",
  };
  const all = loadCache().filter((e) => e.plot_id !== plot.plot_id);
  all.push(entry);
  saveCache(all);
  return entry;
}

export function listNdviCacheEntries(): NdviCacheEntry[] {
  return loadCache();
}

export function formatNdviReply(plot: NdviPlotConfig, entry: NdviCacheEntry): string {
  const health =
    entry.ndvi_mean >= 0.6 ? "长势良好" : entry.ndvi_mean >= 0.4 ? "长势一般" : "长势偏弱";
  const entity = plot.entity_id ? `（${plot.entity_id}）` : "";
  return (
    `地块 ${plot.plot_id}${entity} 最新 NDVI 均值 ${entry.ndvi_mean.toFixed(2)}，${health}。` +
    `观测时间 ${entry.observed_at.slice(0, 16)}，来源 ${entry.source}。`
  );
}

export function writeNdviCacheForTests(entry: NdviCacheEntry): void {
  const all = loadCache().filter((e) => e.plot_id !== entry.plot_id);
  all.push(entry);
  saveCache(all);
}
