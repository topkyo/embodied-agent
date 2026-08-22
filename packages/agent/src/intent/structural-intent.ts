import type { IntentPayload, StructuralHistoryTurn } from "@embodied-agent/core";
import type { AgentRuntimeBindings } from "../runtime-bindings.js";

export type { StructuralHistoryTurn } from "@embodied-agent/core";

export function tryStructuralIntentOverride(
  bindings: AgentRuntimeBindings,
  utterance: string,
  history?: readonly StructuralHistoryTurn[],
): IntentPayload | null {
  return bindings.tryStructuralIntentOverride(utterance, history);
}

export function refineStructuralIntentFromUtterance(
  bindings: AgentRuntimeBindings,
  utterance: string,
  intent: IntentPayload,
): IntentPayload {
  return bindings.refineStructuralIntentFromUtterance(utterance, intent);
}
