import { createLogger } from "@embodied-agent/platform";
import { existsSync, readFileSync, unlinkSync } from "node:fs";

const geoLog = createLogger("geo");
import { atomicWriteJson } from "@embodied-agent/platform";
import { deploymentScopedPath } from "../../fs/deployment-path.js";
import { loadSettingsFile } from "../../settings/store.js";

import { resolveNodeGpsCoordinates } from "./node-gps.js";

export type GeoSource = "manual" | "node" | "env" | "ip";

export type GeoCoordinates = {
  latitude: number;
  longitude: number;
  source: GeoSource;
  updated_at: string;
  city?: string;
  region?: string;
  provider?: string;
  node_id?: string;
  accuracy_m?: number;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function cachePath(): string {
  return deploymentScopedPath("geo-coordinates-cache.json");
}

export function loadGeoCache(): GeoCoordinates | null {
  const path = cachePath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as GeoCoordinates;
    if (typeof raw.latitude !== "number" || typeof raw.longitude !== "number") {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

function saveGeoCache(entry: GeoCoordinates): void {
  atomicWriteJson(cachePath(), entry);
}

function isFresh(entry: GeoCoordinates, now = Date.now()): boolean {
  const at = new Date(entry.updated_at).getTime();
  return Number.isFinite(at) && now - at < CACHE_TTL_MS;
}

function isLockedCoordinatesSource(source: string | undefined): source is "manual" {
  return source === "manual";
}

export function hasManualDeploymentGeo(): boolean {
  const file = loadSettingsFile();
  return (
    isLockedCoordinatesSource(file.geo_coordinates_source) &&
    typeof file.geo_latitude === "number" &&
    typeof file.geo_longitude === "number"
  );
}

function envCoordinates(): GeoCoordinates | null {
  const lat = process.env.GEO_LATITUDE;
  const lng = process.env.GEO_LONGITUDE;
  if (!lat || !lng) return null;
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    source: "env",
    updated_at: new Date().toISOString(),
    provider: "env",
  };
}

function manualCoordinates(): GeoCoordinates | null {
  const file = loadSettingsFile();
  if (!isLockedCoordinatesSource(file.geo_coordinates_source)) return null;
  if (typeof file.geo_latitude !== "number" || typeof file.geo_longitude !== "number") {
    return null;
  }
  return {
    latitude: file.geo_latitude,
    longitude: file.geo_longitude,
    source: file.geo_coordinates_source,
    updated_at: file.geo_coordinates_updated_at ?? new Date().toISOString(),
    provider: "settings",
  };
}

export async function fetchIpCoordinates(): Promise<GeoCoordinates> {
  const res = await fetch("https://ipwho.is/", {
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    throw new Error(`IP 定位请求失败：HTTP ${res.status}`);
  }
  const payload = (await res.json()) as {
    success?: boolean;
    latitude?: number;
    longitude?: number;
    city?: string;
    region?: string;
  };
  if (
    payload.success === false ||
    typeof payload.latitude !== "number" ||
    typeof payload.longitude !== "number"
  ) {
    throw new Error("IP 定位服务未返回有效坐标。");
  }
  return {
    latitude: payload.latitude,
    longitude: payload.longitude,
    source: "ip",
    updated_at: new Date().toISOString(),
    city: payload.city,
    region: payload.region,
    provider: "ipwho.is",
  };
}

export async function refreshNetworkCoordinates(opts?: {
  force?: boolean;
}): Promise<GeoCoordinates> {
  if (hasManualDeploymentGeo()) {
    return manualCoordinates()!;
  }
  const env = envCoordinates();
  if (env) return env;

  const cached = loadGeoCache();
  if (cached && isFresh(cached) && !opts?.force) {
    return cached;
  }

  try {
    const fresh = await fetchIpCoordinates();
    saveGeoCache(fresh);
    return fresh;
  } catch (e) {
    if (cached) return cached;
    throw e instanceof Error ? e : new Error(String(e));
  }
}

export function resolveDeploymentCoordinatesSync(): GeoCoordinates {
  const manual = manualCoordinates();
  if (manual) return manual;
  const env = envCoordinates();
  if (env) return env;
  const nodeGps = resolveNodeGpsCoordinates();
  if (nodeGps) {
    return {
      latitude: nodeGps.latitude,
      longitude: nodeGps.longitude,
      source: "node",
      updated_at: nodeGps.reported_at,
      provider: `node:${nodeGps.node_id}`,
      node_id: nodeGps.node_id,
      accuracy_m: nodeGps.accuracy_m,
    };
  }
  const cached = loadGeoCache();
  if (cached) return cached;
  throw new Error("deployment geo coordinates are not configured");
}

export async function refreshNetworkCoordinatesIfNeeded(): Promise<void> {
  if (hasManualDeploymentGeo() || envCoordinates()) return;
  if (resolveNodeGpsCoordinates()) return;
  const cached = loadGeoCache();
  if (cached && isFresh(cached)) return;
  try {
    await refreshNetworkCoordinates();
    geoLog.info("deployment coordinates refreshed from network");
  } catch (e) {
    geoLog.warn("network coordinate refresh failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export function clearGeoCacheForTests(): void {
  const path = cachePath();
  if (existsSync(path)) unlinkSync(path);
}
