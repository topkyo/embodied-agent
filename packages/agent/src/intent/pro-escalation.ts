import type { IntentPayload } from "@embodied-agent/core";
import type { IntentValidationResult } from "./validate.js";
import type { AgentRuntimeBindings } from "../runtime-bindings.js";

type ResolvedOk = { ok: true; validation: IntentValidationResult };
type ResolvedFail = { ok: false; unavailable: true; message: string };
export type ResolveIntentForEscalation = ResolvedOk | ResolvedFail;

const CORRECTION_HINT = /不是|不对|搞错|弄错|我说的是|要的是/;

export type ProEscalationReason =
  "repairable_json" | "skill_utterance_conflict" | "low_confidence_control" | "user_correction";

export function isUserCorrectionUtterance(text: string): boolean {
  return CORRECTION_HINT.test(text.trim());
}

export function detectSkillUtteranceConflict(
  bindings: AgentRuntimeBindings,
  utterance: string,
  skill: string,
): boolean {
  return bindings.detectSkillUtteranceConflict(utterance, skill, bindings.getEffectiveSettings());
}

function isLowConfidenceControl(bindings: AgentRuntimeBindings, intent: IntentPayload): boolean {
  if (!bindings.isLowConfidenceControlSkill(intent.skill, bindings.getEffectiveSettings())) {
    return false;
  }
  const c = intent.confidence;
  if (typeof c !== "number") return false;
  return c < 0.82;
}

export function evaluateProEscalation(
  bindings: AgentRuntimeBindings,
  opts: {
    result: ResolveIntentForEscalation;
    utterance: string;
    force?: boolean;
  },
): { escalate: boolean; reason?: ProEscalationReason } {
  if (opts.force) {
    return { escalate: true, reason: "user_correction" };
  }

  const { result, utterance } = opts;
  if (!result.ok) return { escalate: false };

  if (result.validation.kind === "clarification") {
    if (result.validation.repairable || result.validation.zodError) {
      return { escalate: true, reason: "repairable_json" };
    }
    return { escalate: false };
  }

  if (detectSkillUtteranceConflict(bindings, utterance, result.validation.intent.skill)) {
    return { escalate: true, reason: "skill_utterance_conflict" };
  }

  if (isLowConfidenceControl(bindings, result.validation.intent)) {
    return { escalate: true, reason: "low_confidence_control" };
  }

  return { escalate: false };
}
