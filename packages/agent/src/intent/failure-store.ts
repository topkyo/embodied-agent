import { createHash } from "node:crypto";
import { createLogger, deploymentScopedPath } from "@embodied-agent/platform";
import { getAgentMemoryJournal } from "../memory-journal.js";
import type { AgentRuntimeBindings } from "../runtime-bindings.js";
import type { LlmChatTurn } from "./llm.js";

const log = createLogger("agent.intent.failure-store");

export type IntentFailureKind =
  | "invalid_json"
  | "schema_failed"
  | "skill_mismatch"
  | "user_correction"
  | "verify_chat"
  | "post_escalation_wrong"
  | "safety_reject";

export type FailureConfidence = "high" | "medium" | "low";

export type CapturedIntent = {
  skill: string;
  target?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
};

export type GoldenExpectation = {
  target?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
};

export type IntentFailureCase = {
  id: string;
  utterance: string;
  raw_response: string;
  error?: string;
  platform?: string;
  model?: string;
  deployment_id?: string;
  conversation_id?: string;
  command_id?: string;
  failure_kind: IntentFailureKind;
  flash_skill?: string;
  pro_skill?: string;
  pro_intent?: CapturedIntent;
  expected_skill?: string;
  expected?: GoldenExpectation;
  escalation_reason?: string;
  history?: readonly LlmChatTurn[];
  assistant_reply_wrong?: string;
  confidence: FailureConfidence;
  promoted: boolean;
  promote_dest?: "wechat" | "golden" | "golden_without_gate" | "skipped";
  recorded_at: string;
};

function currentDeploymentId(bindings: AgentRuntimeBindings): string {
  return bindings.getEffectiveSettings().deployment_id;
}

export function failuresPath(
  bindings: AgentRuntimeBindings,
  deploymentId = currentDeploymentId(bindings),
): string {
  return deploymentScopedPath(bindings.dataRoot(), deploymentId, "intent-failures.jsonl");
}

function hashId(utterance: string): string {
  return `f-${createHash("sha256").update(utterance.trim()).digest("hex").slice(0, 12)}`;
}

function appendFailure(
  bindings: AgentRuntimeBindings,
  deploymentId: string,
  row: IntentFailureCase,
): void {
  getAgentMemoryJournal(bindings).appendIntentFailure(deploymentId, row);
}

function normalizeRow(raw: Record<string, unknown>): IntentFailureCase {
  const error = typeof raw.error === "string" ? raw.error : undefined;
  const failure_kind =
    (raw.failure_kind as IntentFailureKind | undefined) ??
    (error === "invalid_json" ? "invalid_json" : "schema_failed");
  return {
    id: String(raw.id),
    utterance: String(raw.utterance),
    raw_response: String(raw.raw_response ?? ""),
    error,
    platform: typeof raw.platform === "string" ? raw.platform : undefined,
    model: typeof raw.model === "string" ? raw.model : undefined,
    deployment_id: typeof raw.deployment_id === "string" ? raw.deployment_id : undefined,
    conversation_id: typeof raw.conversation_id === "string" ? raw.conversation_id : undefined,
    command_id: typeof raw.command_id === "string" ? raw.command_id : undefined,
    failure_kind,
    flash_skill: typeof raw.flash_skill === "string" ? raw.flash_skill : undefined,
    pro_skill: typeof raw.pro_skill === "string" ? raw.pro_skill : undefined,
    pro_intent: raw.pro_intent as CapturedIntent | undefined,
    expected_skill: typeof raw.expected_skill === "string" ? raw.expected_skill : undefined,
    expected: raw.expected as GoldenExpectation | undefined,
    escalation_reason:
      typeof raw.escalation_reason === "string" ? raw.escalation_reason : undefined,
    history: raw.history as readonly LlmChatTurn[] | undefined,
    assistant_reply_wrong:
      typeof raw.assistant_reply_wrong === "string" ? raw.assistant_reply_wrong : undefined,
    confidence: (raw.confidence as FailureConfidence | undefined) ?? "low",
    promoted: Boolean(raw.promoted),
    promote_dest: raw.promote_dest as IntentFailureCase["promote_dest"],
    recorded_at: String(raw.recorded_at ?? new Date().toISOString()),
  };
}

export function loadIntentFailures(
  bindings: AgentRuntimeBindings,
  deploymentId = currentDeploymentId(bindings),
): IntentFailureCase[] {
  return getAgentMemoryJournal(bindings)
    .loadIntentFailures(deploymentId)
    .map((row) => normalizeRow(row as Record<string, unknown>));
}

function mergeCase(
  existing: IntentFailureCase,
  patch: Partial<IntentFailureCase>,
): IntentFailureCase {
  const merged: IntentFailureCase = {
    ...existing,
    recorded_at: new Date().toISOString(),
  };
  for (const [key, value] of Object.entries(patch) as [
    keyof IntentFailureCase,
    IntentFailureCase[keyof IntentFailureCase],
  ][]) {
    if (value !== undefined && key !== "id" && key !== "recorded_at") {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  if (patch.confidence === "high" || existing.confidence === "high") {
    merged.confidence = "high";
  }
  return merged;
}

export function upsertIntentFailureCase(
  bindings: AgentRuntimeBindings,
  patch: Omit<IntentFailureCase, "id" | "promoted" | "recorded_at"> & {
    utterance: string;
    promoted?: boolean;
  },
): IntentFailureCase {
  if (process.env.NODE_ENV === "test") {
    return {
      id: hashId(patch.utterance),
      promoted: false,
      recorded_at: new Date().toISOString(),
      ...patch,
    };
  }

  const deploymentId = patch.deployment_id?.trim() || currentDeploymentId(bindings);
  const id = hashId(patch.utterance.trim());
  const existing = loadIntentFailures(bindings, deploymentId);
  const existingIdx = existing.findIndex((r) => r.id === id);

  const row: IntentFailureCase = {
    id,
    utterance: patch.utterance.trim(),
    raw_response: patch.raw_response ?? "",
    error: patch.error,
    platform: patch.platform,
    model: patch.model,
    deployment_id: deploymentId,
    conversation_id: patch.conversation_id,
    command_id: patch.command_id,
    failure_kind: patch.failure_kind,
    flash_skill: patch.flash_skill,
    pro_skill: patch.pro_skill,
    pro_intent: patch.pro_intent,
    expected_skill: patch.expected_skill,
    expected: patch.expected,
    escalation_reason: patch.escalation_reason,
    history: patch.history,
    assistant_reply_wrong: patch.assistant_reply_wrong,
    confidence: patch.confidence,
    promoted: patch.promoted ?? false,
    promote_dest: patch.promote_dest,
    recorded_at: new Date().toISOString(),
  };

  if (existingIdx >= 0 && existing[existingIdx]!.promoted) {
    row.promoted = true;
    row.promote_dest = existing[existingIdx]!.promote_dest;
  }

  if (existingIdx >= 0) {
    const merged = mergeCase(existing[existingIdx]!, row);
    if (existing[existingIdx]!.promoted) {
      merged.promoted = true;
      merged.promote_dest = existing[existingIdx]!.promote_dest;
    }
    existing[existingIdx] = merged;
    appendFailure(bindings, deploymentId, merged);
    log.info("intent-failure", {
      id: merged.id,
      kind: merged.failure_kind,
      confidence: merged.confidence,
      utterance: merged.utterance,
    });
    return merged;
  }

  appendFailure(bindings, deploymentId, row);
  log.info("intent-failure", {
    id: row.id,
    kind: row.failure_kind,
    confidence: row.confidence,
    utterance: row.utterance,
  });
  return row;
}

export type RecordIntentFailureInput = {
  utterance: string;
  raw_response?: string;
  error?: string;
  platform?: string;
  model?: string;
  deployment_id?: string;
  conversation_id?: string;
  command_id?: string;
  failure_kind?: IntentFailureKind;
  flash_skill?: string;
  pro_skill?: string;
  pro_intent?: CapturedIntent;
  expected_skill?: string;
  expected?: GoldenExpectation;
  escalation_reason?: string;
  history?: readonly LlmChatTurn[];
  assistant_reply_wrong?: string;
  confidence?: FailureConfidence;
};

function resolveFailureKind(
  error: string | undefined,
  explicit?: IntentFailureKind,
): IntentFailureKind {
  if (explicit) return explicit;
  if (error === "invalid_json") return "invalid_json";
  return "schema_failed";
}

/** Unified entry for LLM resolve failures and chat-captured mismatches. */
export function recordIntentFailureUnified(
  bindings: AgentRuntimeBindings,
  entry: RecordIntentFailureInput,
): IntentFailureCase {
  return upsertIntentFailureCase(bindings, {
    utterance: entry.utterance,
    raw_response: entry.raw_response ?? "",
    error: entry.error,
    platform: entry.platform,
    model: entry.model,
    deployment_id: entry.deployment_id,
    conversation_id: entry.conversation_id,
    command_id: entry.command_id,
    failure_kind: resolveFailureKind(entry.error, entry.failure_kind),
    flash_skill: entry.flash_skill,
    pro_skill: entry.pro_skill,
    pro_intent: entry.pro_intent,
    expected_skill: entry.expected_skill,
    expected: entry.expected,
    escalation_reason: entry.escalation_reason,
    history: entry.history,
    assistant_reply_wrong: entry.assistant_reply_wrong,
    confidence: entry.confidence ?? "low",
  });
}

export function markFailurePromoted(
  bindings: AgentRuntimeBindings,
  id: string,
  dest: IntentFailureCase["promote_dest"] = "golden",
): void {
  const deploymentId = currentDeploymentId(bindings);
  const rows = loadIntentFailures(bindings, deploymentId);
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return;
  if (rows[idx]!.promoted) return;
  rows[idx] = { ...rows[idx]!, promoted: true, promote_dest: dest };
  appendFailure(bindings, deploymentId, rows[idx]!);
}
