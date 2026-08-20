import type { IntentPayload } from "@embodied-agent/core";
import type { SafetyDecision } from "@embodied-agent/safety";
import { appendOperationLog } from "../../db/log.js";
import { setPendingConfirm } from "../../policy/pending-confirm.js";
import { recordRejectedIntent } from "../../policy/pending-clarification.js";
import { formatSafetyRejection } from "../../policy/safety-reply.js";
import { getIntentResolver } from "../../runtime/agent-context.js";
import { getEffectiveSettings } from "../../settings/store.js";
import { riskLevelForScene } from "../../scene/risk-level.js";
import type { RouteContext } from "../route-context.js";
import { pendingSummary } from "../physical/command-replies.js";
import { resolveSceneForRoute } from "../physical/scene-for-route.js";
import { executeDomainPreDispatch } from "@embodied-agent/runtime";
import { getPlatformRuntimeContext } from "../../runtime/context.js";

export type PreDispatchResult =
  { type: "continue" } | { type: "reply"; reply: string; status: number };

export function runDomainClarificationRoute(
  intent: IntentPayload,
  ctx: RouteContext,
): PreDispatchResult {
  return executeDomainPreDispatch(getPlatformRuntimeContext(), "pre_safety", intent, ctx);
}

export function runSafetyRejectionRoute(
  intent: IntentPayload,
  ctx: RouteContext,
  safety: SafetyDecision,
  device?: { manual_override?: boolean },
  entityId?: string,
): PreDispatchResult {
  if (safety.allowed) return { type: "continue" };
  const reply = formatSafetyRejection(safety);
  const scene_skill_id = resolveSceneForRoute(intent, ctx, device, safety.reason);
  if (ctx.conversation_id) {
    recordRejectedIntent(ctx.user_id, ctx.conversation_id, intent, reply);
  }
  if (ctx.utterance?.trim()) {
    const parameters =
      "parameters" in intent && intent.parameters
        ? (intent.parameters as Record<string, unknown>)
        : undefined;
    getIntentResolver().recordIntentFailureUnified({
      utterance: ctx.utterance.trim(),
      raw_response: JSON.stringify({
        skill: intent.skill,
        target: intent.target,
        parameters,
      }),
      error: safety.reason,
      platform: ctx.platform,
      deployment_id: getEffectiveSettings().deployment_id,
      conversation_id: ctx.conversation_id,
      model: ctx.model,
      failure_kind: "safety_reject",
      expected_skill: intent.skill,
      confidence: "high",
    });
  }
  appendOperationLog({
    user_id: ctx.user_id,
    skill: intent.skill,
    intent_source: "llm",
    model: ctx.model,
    params: {
      ...(scene_skill_id ? { scene_skill_id } : {}),
      ...(scene_skill_id
        ? { risk_level: riskLevelForScene(getPlatformRuntimeContext(), scene_skill_id) }
        : {}),
      ...(entityId ? { entity_id: entityId } : {}),
    },
    result: "rejected",
    message: reply,
  });
  return { type: "reply", reply, status: 403 };
}

export function runConfirmationRoute(
  intent: IntentPayload,
  ctx: RouteContext,
  safety: SafetyDecision,
  device?: { manual_override?: boolean },
): PreDispatchResult {
  if (!safety.requires_confirmation || ctx.skip_confirmation) {
    return { type: "continue" };
  }
  const scene_skill_id = resolveSceneForRoute(intent, ctx, device);
  if (ctx.conversation_id) {
    setPendingConfirm({
      intent,
      user_id: ctx.user_id,
      conversation_id: ctx.conversation_id,
      model: ctx.model,
      scene_skill_id,
    });
  }
  const summary = pendingSummary(intent);
  return {
    type: "reply",
    reply: `${safety.reason} 将执行：${summary}。请直接回复「确认」（也可回复「取消」）。`,
    status: 200,
  };
}

export function runAlertAndReportMutations(
  intent: IntentPayload,
  ctx: RouteContext,
): PreDispatchResult {
  return executeDomainPreDispatch(getPlatformRuntimeContext(), "post_confirmation", intent, ctx);
}
