import type { AgentRuntimeBindings } from "../runtime-bindings.js";
import {
  createFetchLlmClient,
  DEFAULT_ESCALATE_MODEL,
  evaluateProEscalation,
  isFlashTierModel,
  resolveIntent,
  type LlmChatTurn,
  type LlmClient,
  type ProEscalationReason,
  type ResolveIntentResult,
} from "./llm.js";
import type { DeploymentContext } from "./prompt.js";
import type { CapturedIntent } from "./failure-store.js";

export type EscalationMeta = {
  escalated: boolean;
  escalation_reason?: ProEscalationReason;
  flash_skill?: string;
  pro_skill?: string;
  flash_intent?: CapturedIntent;
  pro_intent?: CapturedIntent;
};

export type ResolveWithEscalationOpts = {
  history?: readonly LlmChatTurn[];
  forcePro?: boolean;
  onEscalate?: (info: {
    from: string;
    to: string;
    reason: ProEscalationReason;
    utterance: string;
  }) => void;
};

function captureIntent(resolved: ResolveIntentResult): CapturedIntent | undefined {
  if (!resolved.ok || resolved.validation.kind !== "intent") return undefined;
  const intent = resolved.validation.intent;
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

export async function resolveWithEscalation(
  bindings: AgentRuntimeBindings,
  text: string,
  deploymentContext: DeploymentContext,
  deps: { llmClient: LlmClient; model: string },
  opts?: ResolveWithEscalationOpts,
): Promise<{ result: ResolveIntentResult; meta: EscalationMeta }> {
  const history = opts?.history ?? [];
  let resolved = await resolveIntent(
    bindings,
    text,
    deploymentContext,
    deps.llmClient,
    deps.model,
    { history },
  );

  const flash_intent = captureIntent(resolved);
  const meta: EscalationMeta = {
    escalated: false,
    flash_skill: flash_intent?.skill,
    flash_intent,
  };

  const escalation = evaluateProEscalation(bindings, {
    result: resolved,
    utterance: text,
    force: opts?.forcePro,
  });

  if (resolved.ok && escalation.escalate && isFlashTierModel(deps.model)) {
    const s = bindings.getEffectiveSettings();
    const escalateModel = process.env.LLM_ESCALATE_MODEL?.trim() || DEFAULT_ESCALATE_MODEL;
    if (s.llm_api_key) {
      const reason: ProEscalationReason = escalation.reason ?? "repairable_json";
      meta.escalated = true;
      meta.escalation_reason = reason;
      opts?.onEscalate?.({
        from: deps.model,
        to: escalateModel,
        reason,
        utterance: text,
      });
      const proClient = createFetchLlmClient({
        apiKey: s.llm_api_key,
        baseUrl: s.llm_base_url,
        model: escalateModel,
        thinking: s.llm_thinking,
      });
      resolved = await resolveIntent(bindings, text, deploymentContext, proClient, escalateModel, {
        history,
      });
      const pro_intent = captureIntent(resolved);
      meta.pro_intent = pro_intent;
      meta.pro_skill = pro_intent?.skill;
    }
  }

  return { result: resolved, meta };
}
