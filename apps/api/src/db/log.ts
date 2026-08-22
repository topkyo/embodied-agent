import type { SkillName } from "@embodied-agent/core";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { deploymentScopedPath } from "../fs/deployment-path.js";
import { atomicWriteText } from "@embodied-agent/platform";
import { getEffectiveSettings } from "../settings/store.js";
import { isSameLocalDay } from "../time/local-day.js";

export type OperationLogEntry = {
  id: string;
  ts: string;
  user_id: string;
  skill: SkillName;
  intent_source: "llm";
  model: string;
  params: Record<string, unknown>;
  result: "completed" | "sent" | "rejected" | "clarification" | "failed";
  message: string;
};

let seq = 0;
const logs: OperationLogEntry[] = [];
let hydratedFromPath: string | null = null;

function logPath(deployment_id?: string): string {
  return deploymentScopedPath("operation-logs.jsonl", deployment_id);
}

function hydrate(deployment_id?: string): void {
  const path = logPath(deployment_id);
  if (hydratedFromPath === path) return;
  logs.length = 0;
  seq = 0;
  hydratedFromPath = path;
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").trim().split("\n")) {
    if (!line) continue;
    try {
      const row = JSON.parse(line) as OperationLogEntry;
      logs.push(row);
      const n = Number(row.id.replace(/^log-/, ""));
      if (Number.isFinite(n)) seq = Math.max(seq, n);
    } catch {
      // Skip corrupt log rows but keep later rows readable.
    }
  }
}

function persistAppend(row: OperationLogEntry): void {
  const path = logPath();
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(row)}\n`, "utf8");
}

function persistTruncate(): void {
  atomicWriteText(
    logPath(),
    logs.length > 0 ? `${logs.map((r) => JSON.stringify(r)).join("\n")}\n` : "",
  );
}

export function appendOperationLog(entry: Omit<OperationLogEntry, "id" | "ts">): OperationLogEntry {
  hydrate();
  const row: OperationLogEntry = {
    id: `log-${++seq}`,
    ts: new Date().toISOString(),
    ...entry,
  };
  logs.push(row);
  persistAppend(row);
  return row;
}

export function queryLogsToday(deployment_id: string, entity_id?: string): OperationLogEntry[] {
  hydrate(deployment_id);
  const timezone = getEffectiveSettings().digest_timezone ?? "Asia/Shanghai";
  const now = new Date();
  return logs.filter(
    (l) =>
      isSameLocalDay(l.ts, now, timezone) &&
      (!entity_id || (l.params.entity_id as string | undefined) === entity_id),
  );
}

export function listOperationLogs(): readonly OperationLogEntry[] {
  hydrate();
  return logs;
}

export function clearOperationLogs(): void {
  hydrate();
  logs.length = 0;
  seq = 0;
  persistTruncate();
}
