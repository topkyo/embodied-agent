import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createLogger } from "@embodied-agent/platform";
import { dataRoot } from "../fs/deployment-path.js";
import type { LlmUsage } from "@embodied-agent/agent";

export type NlgLogEntry = {
  kind: "query" | "combined_query" | "proactive_summary";
  model: string;
  latency_ms: number;
  skill?: string;
  proactive_kind?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  error?: string;
  recorded_at?: string;
};

const buffer: NlgLogEntry[] = [];
const persistQueue: string[] = [];
let flushScheduled = false;
const log = createLogger("nlg.observability");

function shouldPersist(): boolean {
  if (process.env.NODE_ENV === "test" && !process.env.AGENT_DATA_DIR?.trim()) {
    return false;
  }
  return true;
}

function logPath(): string {
  return resolve(dataRoot(), "nlg-resolve.jsonl");
}

function flushPersistQueue(): void {
  flushScheduled = false;
  if (!shouldPersist() || persistQueue.length === 0) return;
  const dir = dataRoot();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const chunk = persistQueue.splice(0, persistQueue.length).join("\n");
  appendFileSync(logPath(), `${chunk}\n`, "utf8");
}

function schedulePersistFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  setImmediate(flushPersistQueue);
}

function enqueuePersisted(entry: NlgLogEntry): void {
  if (!shouldPersist()) return;
  const line = JSON.stringify({
    ...entry,
    recorded_at: entry.recorded_at ?? new Date().toISOString(),
  });
  persistQueue.push(line);
  schedulePersistFlush();
}

export function llmUsageFields(usage: LlmUsage | undefined): Partial<NlgLogEntry> {
  if (!usage) return {};
  return {
    ...(usage.prompt_tokens !== undefined ? { prompt_tokens: usage.prompt_tokens } : {}),
    ...(usage.completion_tokens !== undefined
      ? { completion_tokens: usage.completion_tokens }
      : {}),
    ...(usage.total_tokens !== undefined ? { total_tokens: usage.total_tokens } : {}),
  };
}

export function recordNlgLog(entry: NlgLogEntry): void {
  buffer.push(entry);
  if (process.env.NODE_ENV !== "test") {
    log.info("nlg", entry);
  }
  enqueuePersisted(entry);
}

/** @internal tests */
export function flushNlgLogsForTests(): void {
  flushPersistQueue();
}

export function getNlgLogs(): readonly NlgLogEntry[] {
  return buffer;
}

export function clearNlgLogs(): void {
  buffer.length = 0;
}
