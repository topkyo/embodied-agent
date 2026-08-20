import { createLogger } from "@embodied-agent/platform";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

import { deploymentScopedPath } from "../fs/deployment-path.js";
import { atomicWriteJson } from "@embodied-agent/platform";
import { attachCommandTelemetryWindow, getCommand } from "../commands/store.js";
import { captureTelemetrySnapshot } from "../commands/telemetry-snapshot.js";
import { evaluateSceneOutcomeFromCommand } from "./evaluate-outcome.js";
import { isSceneSkillId } from "./registry.js";

const log = createLogger("scene-outcome");
const PENDING_FILE = "scene-outcome-pending.json";
const RETRY_MS = 5 * 60_000;
const MAX_ATTEMPTS = 12;

export type OutcomeWindowPending = {
  command_id: string;
  deployment_id: string;
  entity_id: string;
  due_at: string;
  window_minutes: number;
  attempts?: number;
};

function pendingPath(deployment_id: string): string {
  return deploymentScopedPath(PENDING_FILE, deployment_id);
}

function readPending(deployment_id: string): OutcomeWindowPending[] {
  const path = pendingPath(deployment_id);
  if (!existsSync(path)) return [];
  try {
    const rows = JSON.parse(readFileSync(path, "utf8")) as OutcomeWindowPending[];
    if (!Array.isArray(rows)) {
      throw new Error("outcome pending rows must be an array");
    }
    for (const row of rows) {
      if (!row.entity_id) {
        throw new Error(`outcome pending row 缺少 entity_id：${row.command_id}`);
      }
    }
    return rows;
  } catch (e) {
    throw new Error(`${path} 无法读取或校验失败：${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}

function writePending(deployment_id: string, rows: OutcomeWindowPending[]): void {
  const path = pendingPath(deployment_id);
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  atomicWriteJson(path, rows);
}

function outcomeWindowMinutes(): number[] {
  const raw = process.env.SCENE_OUTCOME_WINDOWS_MINUTES?.trim();
  if (!raw) return [15];
  const parsed = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return parsed.length > 0 ? parsed : [15];
}

function scheduleRetry(row: OutcomeWindowPending, now: number, keep: OutcomeWindowPending[]): void {
  const attempts = (row.attempts ?? 0) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    log.warn("dropping outcome window after max attempts", {
      attempts: MAX_ATTEMPTS,
      command_id: row.command_id,
      deployment_id: row.deployment_id,
      entity_id: row.entity_id,
    });
    return;
  }
  keep.push({
    ...row,
    attempts,
    due_at: new Date(now + RETRY_MS).toISOString(),
  });
}

export function enqueueOutcomeWindows(
  command_id: string,
  deployment_id: string,
  entity_id: string,
): void {
  const now = Date.now();
  const existing = readPending(deployment_id);
  const due = outcomeWindowMinutes()
    .filter((m) => !existing.some((r) => r.command_id === command_id && r.window_minutes === m))
    .map((window_minutes) => ({
      command_id,
      deployment_id,
      entity_id,
      window_minutes,
      due_at: new Date(now + window_minutes * 60_000).toISOString(),
      attempts: 0,
    }));
  if (due.length === 0) return;
  writePending(deployment_id, [...existing, ...due]);
}

export function tickOutcomeScheduler(deployment_ids: string[], now = Date.now()): number {
  let processed = 0;
  for (const deployment_id of deployment_ids) {
    const rows = readPending(deployment_id);
    if (rows.length === 0) continue;
    const keep: OutcomeWindowPending[] = [];
    for (const row of rows) {
      if (new Date(row.due_at).getTime() > now) {
        keep.push(row);
        continue;
      }
      const record = getCommand(row.command_id, deployment_id);
      if (!record || record.status !== "completed") {
        scheduleRetry(row, now, keep);
        continue;
      }
      const snap = captureTelemetrySnapshot(row.entity_id, row.deployment_id);
      if (!snap) {
        scheduleRetry(row, now, keep);
        continue;
      }
      const updated = attachCommandTelemetryWindow(
        row.command_id,
        row.window_minutes,
        snap,
        deployment_id,
      );
      if (updated?.scene_skill_id && isSceneSkillId(updated.scene_skill_id)) {
        evaluateSceneOutcomeFromCommand(updated);
      }
      processed++;
    }
    writePending(deployment_id, keep);
  }
  return processed;
}

/** @internal tests */
export function clearOutcomeSchedulerForTest(deployment_id: string): void {
  writePending(deployment_id, []);
}

export function readOutcomeSchedulerPendingForTest(deployment_id: string): OutcomeWindowPending[] {
  return readPending(deployment_id);
}
