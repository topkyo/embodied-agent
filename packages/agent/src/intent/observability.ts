import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createLogger } from "@embodied-agent/platform";
import type { AgentRuntimeBindings } from "../runtime-bindings.js";

export type IntentLogEntry = {
  intent_source: "llm";
  model: string;
  latency_ms: number;
  raw_response: string;
  validated: boolean;
  skill?: string;
  error?: string;
  deployment_id?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  recorded_at?: string;
};

/**
 * 内存 buffer 仅供测试读取（getIntentLogs/clearIntentLogs），生产无消费者。
 * 必须有界：超出上限丢弃最旧条目，避免长运行进程内存缓慢增长。
 */
const BUFFER_MAX_ENTRIES = 500;

const buffer: IntentLogEntry[] = [];
const persistQueue: string[] = [];
let flushScheduled = false;
const log = createLogger("agent.intent.observability");

function shouldPersist(): boolean {
  if (process.env.NODE_ENV === "test" && !process.env.AGENT_DATA_DIR?.trim()) {
    return false;
  }
  return true;
}

function logPath(bindings: AgentRuntimeBindings): string {
  return resolve(bindings.dataRoot(), "intent-resolve.jsonl");
}

function flushPersistQueue(bindings: AgentRuntimeBindings): void {
  flushScheduled = false;
  if (!shouldPersist() || persistQueue.length === 0) return;
  const dir = bindings.dataRoot();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const chunk = persistQueue.splice(0, persistQueue.length).join("\n");
  appendFileSync(logPath(bindings), `${chunk}\n`, "utf8");
}

function schedulePersistFlush(bindings: AgentRuntimeBindings): void {
  if (flushScheduled) return;
  flushScheduled = true;
  setImmediate(() => flushPersistQueue(bindings));
}

function enqueuePersisted(bindings: AgentRuntimeBindings, entry: IntentLogEntry): void {
  if (!shouldPersist()) return;
  const line = JSON.stringify({
    ...entry,
    recorded_at: entry.recorded_at ?? new Date().toISOString(),
  });
  persistQueue.push(line);
  schedulePersistFlush(bindings);
}

export function recordIntentLog(bindings: AgentRuntimeBindings, entry: IntentLogEntry): void {
  buffer.push(entry);
  if (buffer.length > BUFFER_MAX_ENTRIES) {
    buffer.splice(0, buffer.length - BUFFER_MAX_ENTRIES);
  }
  if (process.env.NODE_ENV !== "test") {
    log.info("intent", entry);
  }
  enqueuePersisted(bindings, entry);
}

/** @internal tests */
export function flushIntentLogsForTests(bindings: AgentRuntimeBindings): void {
  flushPersistQueue(bindings);
}

export function getIntentLogs(): readonly IntentLogEntry[] {
  return buffer;
}

export function clearIntentLogs(): void {
  buffer.length = 0;
}
