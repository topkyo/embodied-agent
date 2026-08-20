import { existsSync, readFileSync, unlinkSync } from "node:fs";

import { atomicWriteJson } from "@embodied-agent/platform";
import { deploymentScopedPath } from "../../fs/deployment-path.js";
export type NodeGpsFix = {
  node_id: string;
  latitude: number;
  longitude: number;
  accuracy_m?: number;
  fix_quality?: number;
  reported_at: string;
};

type NodeGpsCache = {
  fixes: NodeGpsFix[];
};

const FIX_TTL_MS = 24 * 60 * 60 * 1000;

function cachePath(): string {
  return deploymentScopedPath("node-gps-cache.json");
}

function loadCache(): NodeGpsCache {
  const path = cachePath();
  if (!existsSync(path)) return { fixes: [] };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as NodeGpsCache;
    if (!Array.isArray(raw.fixes)) return { fixes: [] };
    return raw;
  } catch {
    return { fixes: [] };
  }
}

function saveCache(cache: NodeGpsCache): void {
  atomicWriteJson(cachePath(), cache);
}

function isValidFix(fix: NodeGpsFix): boolean {
  return (
    typeof fix.node_id === "string" &&
    fix.node_id.length > 0 &&
    Number.isFinite(fix.latitude) &&
    fix.latitude >= -90 &&
    fix.latitude <= 90 &&
    Number.isFinite(fix.longitude) &&
    fix.longitude >= -180 &&
    fix.longitude <= 180 &&
    typeof fix.reported_at === "string"
  );
}

function isFreshFix(fix: NodeGpsFix, now = Date.now()): boolean {
  const at = new Date(fix.reported_at).getTime();
  return Number.isFinite(at) && now - at < FIX_TTL_MS;
}

function parseGpsPayload(
  raw: Record<string, unknown>,
  node_id: string,
  reported_at: string,
): NodeGpsFix | null {
  const gps = raw.gps;
  if (!gps || typeof gps !== "object") return null;
  const g = gps as Record<string, unknown>;
  const latitude = Number(g.latitude);
  const longitude = Number(g.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const fix: NodeGpsFix = {
    node_id,
    latitude,
    longitude,
    reported_at,
  };
  const accuracy = Number(g.accuracy_m);
  if (Number.isFinite(accuracy) && accuracy >= 0) fix.accuracy_m = accuracy;
  const fixQuality = Number(g.fix_quality);
  if (Number.isFinite(fixQuality)) fix.fix_quality = fixQuality;
  return isValidFix(fix) ? fix : null;
}

/** 从 node heartbeat 摄入 GPS 定位（可选字段 `gps`） */
export function ingestNodeGpsFromHeartbeat(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const raw = payload as Record<string, unknown>;
  const node_id = String(raw.node_id ?? "");
  if (!node_id) return false;
  const reported_at =
    typeof raw.reported_at === "string" ? raw.reported_at : new Date().toISOString();
  const fix = parseGpsPayload(raw, node_id, reported_at);
  if (!fix) return false;

  const cache = loadCache();
  const rest = cache.fixes.filter((f) => f.node_id !== node_id);
  rest.push(fix);
  saveCache({ fixes: rest });
  return true;
}

export function resolveNodeGpsCoordinates(now = Date.now()): NodeGpsFix | null {
  const cache = loadCache();
  const fresh = cache.fixes
    .filter((f) => isValidFix(f) && isFreshFix(f, now))
    .sort((a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime());
  return fresh[0] ?? null;
}

export function clearNodeGpsCacheForTests(): void {
  const path = cachePath();
  if (existsSync(path)) unlinkSync(path);
}
