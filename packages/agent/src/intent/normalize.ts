import type { IntentPayload } from "@embodied-agent/core";
import type { AgentRuntimeBindings } from "../runtime-bindings.js";

export function refineIntentFromUtterance(
  bindings: AgentRuntimeBindings,
  utterance: string,
  intent: IntentPayload,
): IntentPayload {
  return bindings.refineIntentFromUtterance(utterance, intent, bindings.getEffectiveSettings());
}

export function normalizeLlmShape(bindings: AgentRuntimeBindings, data: unknown): unknown {
  return bindings.normalizeLlmShape(data, bindings.getEffectiveSettings());
}
