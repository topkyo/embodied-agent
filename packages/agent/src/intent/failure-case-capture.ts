export type ChatMessageSlice = {
  platform: string;
  conversation_id: string;
  text: string;
};
import type { AgentRuntimeBindings } from "../runtime-bindings.js";
import { detectSkillUtteranceConflict } from "./pro-escalation.js";
import type { CapturedIntent } from "./failure-store.js";
import { recordIntentFailureUnified } from "./failure-store.js";
import type { ResolveIntentResult } from "./llm.js";
import type { EscalationMeta } from "./resolve-with-escalation.js";

function captureFromValidation(
  validation: Extract<ResolveIntentResult, { ok: true }>["validation"],
): CapturedIntent | undefined {
  if (validation.kind !== "intent") return undefined;
  const intent = validation.intent;
  const parameters =
    "parameters" in intent && intent.parameters
      ? (intent.parameters as Record<string, unknown>)
      : undefined;
  return {
    skill: intent.skill,
    target: intent.target as Record<string, unknown> | undefined,
    parameters,
  };
}

function lastAssistantReply(
  history: readonly { role: string; content: string }[],
): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") return history[i]!.content;
  }
  return undefined;
}

export function captureFailureCaseFromChat(
  bindings: AgentRuntimeBindings,
  opts: {
    msg: ChatMessageSlice;
    deployment_id: string;
    model: string;
    forcePro: boolean;
    history: readonly { role: "user" | "assistant"; content: string }[];
    result: ResolveIntentResult;
    meta: EscalationMeta;
    previous_command_id?: string;
  },
): void {
  if (!opts.result.ok) return;

  const { msg, deployment_id, model, forcePro, history, result, meta, previous_command_id } = opts;
  const finalIntent = captureFromValidation(result.validation);

  if (forcePro && meta.escalated && meta.pro_intent) {
    recordIntentFailureUnified(bindings, {
      utterance: msg.text,
      raw_response: "",
      platform: msg.platform,
      deployment_id,
      conversation_id: msg.conversation_id,
      model,
      failure_kind: "user_correction",
      pro_intent: meta.pro_intent,
      pro_skill: meta.pro_intent.skill,
      history: history.length > 0 ? history : undefined,
      assistant_reply_wrong: lastAssistantReply(history),
      escalation_reason: meta.escalation_reason,
      confidence: "high",
      command_id: previous_command_id,
    });
    return;
  }

  if (meta.escalated && meta.escalation_reason === "skill_utterance_conflict" && meta.flash_skill) {
    const proIntent = meta.pro_intent ?? finalIntent;
    if (proIntent && !detectSkillUtteranceConflict(bindings, msg.text, proIntent.skill)) {
      recordIntentFailureUnified(bindings, {
        utterance: msg.text,
        raw_response: "",
        platform: msg.platform,
        deployment_id,
        conversation_id: msg.conversation_id,
        model,
        failure_kind: "skill_mismatch",
        flash_skill: meta.flash_skill,
        pro_skill: proIntent.skill,
        pro_intent: proIntent,
        escalation_reason: meta.escalation_reason,
        history: history.length > 0 ? history : undefined,
        confidence: "high",
      });
      return;
    }

    if (result.validation.kind === "clarification") {
      recordIntentFailureUnified(bindings, {
        utterance: msg.text,
        raw_response: "",
        platform: msg.platform,
        deployment_id,
        conversation_id: msg.conversation_id,
        model,
        failure_kind: "post_escalation_wrong",
        flash_skill: meta.flash_skill,
        pro_skill: meta.pro_skill,
        escalation_reason: meta.escalation_reason,
        history: history.length > 0 ? history : undefined,
        confidence: "medium",
      });
    }
    return;
  }

  if (
    !meta.escalated &&
    meta.flash_skill &&
    detectSkillUtteranceConflict(bindings, msg.text, meta.flash_skill)
  ) {
    recordIntentFailureUnified(bindings, {
      utterance: msg.text,
      raw_response: "",
      platform: msg.platform,
      deployment_id,
      conversation_id: msg.conversation_id,
      model,
      failure_kind: "skill_mismatch",
      flash_skill: meta.flash_skill,
      pro_skill: finalIntent?.skill,
      escalation_reason: "skill_utterance_conflict",
      history: history.length > 0 ? history : undefined,
      confidence: "medium",
    });
  }
}
