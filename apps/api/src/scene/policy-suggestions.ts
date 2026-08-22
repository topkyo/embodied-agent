import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { deploymentScopedPath } from "../fs/deployment-path.js";
import { atomicWriteJson } from "@embodied-agent/platform";
import type { IntentPayload } from "@embodied-agent/core";
import { listAlertRules, setAlertRule } from "../alerts/threshold-store.js";
import { activePolicySuggestions } from "@embodied-agent/runtime";
import { aggregateSceneOutcomesByEntity } from "./outcome-store.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";
import type { SceneSkillId } from "./registry.js";

const FILE = "policy-suggestions.json";

export type PolicySuggestionStatus = "pending" | "applied" | "dismissed";

export type PolicySuggestion = {
  id: string;
  deployment_id: string;
  kind: string;
  scene_skill_id?: SceneSkillId;
  status: PolicySuggestionStatus;
  created_at: string;
  applied_at?: string;
  reason: string;
  intent: IntentPayload;
};

function suggestionsPath(deployment_id: string): string {
  return deploymentScopedPath(FILE, deployment_id);
}

function policySuggestionsRuntime() {
  const runtime = activePolicySuggestions(getPlatformRuntimeContext());
  if (!runtime) {
    throw new Error("当前 Domain Pack 未提供 policySuggestions。");
  }
  return runtime;
}

function readAll(deployment_id: string): PolicySuggestion[] {
  const path = suggestionsPath(deployment_id);
  if (!existsSync(path)) return [];
  try {
    const rows = JSON.parse(readFileSync(path, "utf8")) as PolicySuggestion[];
    if (!Array.isArray(rows)) {
      throw new Error("policy suggestions must be an array");
    }
    return rows;
  } catch (e) {
    throw new Error(`${path} 无法读取或校验失败：${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}

function writeAll(deployment_id: string, rows: PolicySuggestion[]): void {
  atomicWriteJson(suggestionsPath(deployment_id), rows);
}

export function listPolicySuggestions(
  deployment_id: string,
  status?: PolicySuggestionStatus,
): PolicySuggestion[] {
  const rows = readAll(deployment_id);
  if (!status) return rows;
  return rows.filter((r) => r.status === status);
}

function hasPendingDuplicate(rows: PolicySuggestion[], intent: IntentPayload): boolean {
  return rows.some(
    (r) =>
      r.status === "pending" &&
      r.intent.skill === intent.skill &&
      JSON.stringify(r.intent.target) === JSON.stringify(intent.target) &&
      JSON.stringify(r.intent.parameters) === JSON.stringify(intent.parameters),
  );
}

export function generatePolicySuggestions(deployment_id: string): PolicySuggestion[] {
  const existing = readAll(deployment_id);
  const created: PolicySuggestion[] = [];
  const now = new Date().toISOString();
  const policySuggestions = policySuggestionsRuntime();

  const drafts = policySuggestions.buildDrafts({
    deploymentId: deployment_id,
    alertRules: listAlertRules(deployment_id),
    services: {
      outcomeStatsByScene(sceneSkillId, sinceDays) {
        return aggregateSceneOutcomesByEntity(deployment_id, sceneSkillId, sinceDays);
      },
    },
  });
  for (const draft of drafts) {
    if (hasPendingDuplicate(existing, draft.intent)) continue;
    created.push({
      id: randomUUID(),
      deployment_id,
      kind: draft.kind,
      scene_skill_id: draft.sceneSkillId,
      status: "pending",
      created_at: now,
      reason: draft.reason,
      intent: draft.intent,
    });
  }

  if (created.length > 0) {
    writeAll(deployment_id, [...existing, ...created]);
  }
  return created;
}

export function applyPolicySuggestion(
  deployment_id: string,
  suggestion_id: string,
  user_id: string,
): { ok: true; suggestion: PolicySuggestion } | { ok: false; error: string } {
  const rows = readAll(deployment_id);
  const idx = rows.findIndex((r) => r.id === suggestion_id);
  if (idx < 0) return { ok: false, error: "策略建议不存在。" };
  const row = rows[idx]!;
  if (row.status !== "pending") {
    return { ok: false, error: "该建议已处理。" };
  }
  const update = policySuggestionsRuntime().buildAlertRuleUpdate(row.intent);
  if (!update) {
    return { ok: false, error: "暂不支持自动应用该策略类型。" };
  }
  setAlertRule({ ...update, updated_by: user_id }, deployment_id);
  const applied: PolicySuggestion = {
    ...row,
    status: "applied",
    applied_at: new Date().toISOString(),
  };
  rows[idx] = applied;
  writeAll(deployment_id, rows);
  return { ok: true, suggestion: applied };
}

export function dismissPolicySuggestion(
  deployment_id: string,
  suggestion_id: string,
): PolicySuggestion | null {
  const rows = readAll(deployment_id);
  const idx = rows.findIndex((r) => r.id === suggestion_id);
  if (idx < 0) return null;
  const row = { ...rows[idx]!, status: "dismissed" as const };
  rows[idx] = row;
  writeAll(deployment_id, rows);
  return row;
}

/** @internal tests */
export function clearPolicySuggestionsForTest(deployment_id: string): void {
  writeAll(deployment_id, []);
}
