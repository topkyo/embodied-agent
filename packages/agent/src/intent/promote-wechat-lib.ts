import type { IntentFailureCase } from "./failure-store.js";
import type { AgentRuntimeBindings } from "../runtime-bindings.js";
import { detectSkillUtteranceConflict } from "./pro-escalation.js";

export type GoldenExpectation = {
  target?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
};

export type WechatMatrixDraft = {
  utterance: string;
  expected_skill: string;
  expected?: GoldenExpectation;
  history?: IntentFailureCase["history"];
  note?: string;
};

export function isPromotableToWechat(
  bindings: AgentRuntimeBindings,
  caseRow: IntentFailureCase,
): boolean {
  if (caseRow.promoted || caseRow.confidence !== "high") return false;

  if (caseRow.failure_kind === "user_correction" && caseRow.pro_intent) {
    return true;
  }

  if (
    caseRow.failure_kind === "skill_mismatch" &&
    caseRow.pro_intent &&
    caseRow.flash_skill &&
    !detectSkillUtteranceConflict(bindings, caseRow.utterance, caseRow.pro_intent.skill)
  ) {
    return true;
  }

  if (
    caseRow.failure_kind === "verify_chat" &&
    caseRow.expected_skill &&
    (caseRow.expected || caseRow.pro_intent)
  ) {
    return true;
  }

  return false;
}

export function buildWechatRow(
  bindings: AgentRuntimeBindings,
  caseRow: IntentFailureCase,
): WechatMatrixDraft | null {
  if (!isPromotableToWechat(bindings, caseRow)) return null;

  let expected_skill: string | undefined;
  let expected = caseRow.expected;

  if (caseRow.failure_kind === "verify_chat") {
    expected_skill = caseRow.expected_skill;
  } else if (caseRow.pro_intent) {
    expected_skill = caseRow.pro_intent.skill;
    expected = {
      ...(caseRow.pro_intent.target ? { target: caseRow.pro_intent.target } : {}),
      ...(caseRow.pro_intent.parameters ? { parameters: caseRow.pro_intent.parameters } : {}),
    };
  } else {
    expected_skill = caseRow.expected_skill;
  }

  if (!expected_skill) return null;

  const noteParts = [
    `auto-promote ${caseRow.failure_kind}`,
    caseRow.platform ? `platform=${caseRow.platform}` : undefined,
    caseRow.id,
    caseRow.recorded_at.slice(0, 10),
  ].filter(Boolean);

  const row: WechatMatrixDraft = {
    utterance: caseRow.utterance,
    expected_skill,
    expected,
    note: noteParts.join(" "),
  };

  if (caseRow.history && caseRow.history.length > 0) {
    row.history = caseRow.history;
  }

  return row;
}

export function utteranceInMatrix(
  utterance: string,
  rows: Pick<WechatMatrixDraft, "utterance">[],
): boolean {
  return rows.some((r) => r.utterance === utterance);
}
