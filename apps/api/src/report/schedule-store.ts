import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { atomicWriteJson } from "@embodied-agent/platform";
import { currentDeploymentId, deploymentScopedPath } from "../fs/deployment-path.js";

export type StatusReportSchedule = {
  id: string;
  deployment_id: string;
  user_id: string;
  entity_ids: string[];
  interval_minutes: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  last_sent_at?: string;
};

type SchedulesFile = { schedules: StatusReportSchedule[] };

function path(deployment_id = currentDeploymentId()): string {
  return deploymentScopedPath("status-report-schedules.json", deployment_id);
}

function readAll(deployment_id = currentDeploymentId()): StatusReportSchedule[] {
  const p = path(deployment_id);
  if (!existsSync(p)) return [];
  try {
    return (JSON.parse(readFileSync(p, "utf8")) as SchedulesFile).schedules ?? [];
  } catch {
    return [];
  }
}

function writeAll(schedules: StatusReportSchedule[], deployment_id = currentDeploymentId()): void {
  const p = path(deployment_id);
  mkdirSync(dirname(p), { recursive: true });
  atomicWriteJson(p, { schedules });
}

export function listSchedulesForUser(
  user_id: string,
  deployment_id = currentDeploymentId(),
): StatusReportSchedule[] {
  return readAll(deployment_id).filter((s) => s.user_id === user_id && s.enabled);
}

export function listAllSchedules(deployment_id = currentDeploymentId()): StatusReportSchedule[] {
  return readAll(deployment_id);
}

export function listDueSchedules(
  now = Date.now(),
  deployment_id = currentDeploymentId(),
): StatusReportSchedule[] {
  return readAll(deployment_id).filter((s) => {
    if (!s.enabled) return false;
    if (!s.last_sent_at) return true;
    const elapsed = now - Date.parse(s.last_sent_at);
    return elapsed >= s.interval_minutes * 60_000;
  });
}

export function upsertSchedule(input: {
  user_id: string;
  entity_ids: string[];
  interval_minutes: number;
  deployment_id?: string;
}): StatusReportSchedule {
  const deployment_id = input.deployment_id ?? currentDeploymentId();
  const schedules = readAll(deployment_id);
  const now = new Date().toISOString();
  const existing = schedules.find((s) => s.user_id === input.user_id && s.enabled);
  const row: StatusReportSchedule = {
    id: existing?.id ?? `sched-${Date.now()}`,
    deployment_id,
    user_id: input.user_id,
    entity_ids: [...new Set(input.entity_ids)],
    interval_minutes: input.interval_minutes,
    enabled: true,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    last_sent_at: existing?.last_sent_at,
  };
  const next = schedules.filter((s) => !(s.user_id === input.user_id && s.enabled));
  next.push(row);
  writeAll(next, deployment_id);
  return row;
}

export function disableSchedulesForUser(
  user_id: string,
  deployment_id = currentDeploymentId(),
): number {
  const schedules = readAll(deployment_id);
  let n = 0;
  for (const s of schedules) {
    if (s.user_id === user_id && s.enabled) {
      s.enabled = false;
      s.updated_at = new Date().toISOString();
      n++;
    }
  }
  writeAll(schedules, deployment_id);
  return n;
}

export function markScheduleSent(
  id: string,
  at = new Date(),
  deployment_id = currentDeploymentId(),
): void {
  const schedules = readAll(deployment_id);
  const hit = schedules.find((s) => s.id === id);
  if (!hit) return;
  hit.last_sent_at = at.toISOString();
  writeAll(schedules, deployment_id);
}

export function clearSchedules(deployment_id = currentDeploymentId()): void {
  writeAll([], deployment_id);
}
