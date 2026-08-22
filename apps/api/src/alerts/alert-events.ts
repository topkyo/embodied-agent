import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deploymentScopedPath } from "../fs/deployment-path.js";
import { getEffectiveSettings } from "../settings/store.js";
import { isSameLocalDay } from "../time/local-day.js";

export type AlertEventType =
  "threshold" | "sustained_threshold" | "suggestion_l2" | "offline" | "recovery";

export type AlertEvent = {
  ts: string;
  deployment_id: string;
  entity_id?: string;
  node_id?: string;
  event_type: AlertEventType;
  metric?: string;
  value?: number;
  message: string;
};

const FILE = "alert-events.jsonl";

function ensureDir(deployment_id: string): void {
  const path = deploymentScopedPath(FILE, deployment_id);
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
}

export function appendAlertEvent(event: Omit<AlertEvent, "ts">): AlertEvent {
  ensureDir(event.deployment_id);
  const row: AlertEvent = { ts: new Date().toISOString(), ...event };
  appendFileSync(
    deploymentScopedPath(FILE, event.deployment_id),
    `${JSON.stringify(row)}\n`,
    "utf8",
  );
  return row;
}

export function queryAlertEventsToday(deployment_id: string, entity_id?: string): AlertEvent[] {
  const path = deploymentScopedPath(FILE, deployment_id);
  if (!existsSync(path)) return [];
  const timezone = getEffectiveSettings().digest_timezone ?? "Asia/Shanghai";
  const now = new Date();
  const rows: AlertEvent[] = [];
  for (const line of readFileSync(path, "utf8").trim().split("\n")) {
    if (!line) continue;
    try {
      const row = JSON.parse(line) as AlertEvent;
      if (!isSameLocalDay(row.ts, now, timezone)) continue;
      if (row.deployment_id !== deployment_id) continue;
      if (entity_id && row.entity_id !== entity_id) continue;
      rows.push(row);
    } catch (e) {
      throw new Error(`${path} 无法读取或校验失败：${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
  }
  return rows;
}

export function listAlertEvents(opts: {
  deployment_id: string;
  sinceDays?: number;
  entity_id?: string;
}): AlertEvent[] {
  const { deployment_id, sinceDays = 7, entity_id } = opts;
  const path = deploymentScopedPath(FILE, deployment_id);
  if (!existsSync(path)) return [];
  const cutoffMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const rows: AlertEvent[] = [];
  for (const line of readFileSync(path, "utf8").trim().split("\n")) {
    if (!line) continue;
    try {
      const row = JSON.parse(line) as AlertEvent;
      if (row.deployment_id !== deployment_id) continue;
      if (entity_id && row.entity_id !== entity_id) continue;
      const ts = Date.parse(row.ts);
      if (!Number.isFinite(ts) || ts < cutoffMs) continue;
      rows.push(row);
    } catch (e) {
      throw new Error(`${path} 无法读取或校验失败：${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
  }
  return rows;
}

export function clearAlertEventsForTest(deployment_id: string): void {
  const path = deploymentScopedPath(FILE, deployment_id);
  if (existsSync(path)) writeFileSync(path, "");
}
