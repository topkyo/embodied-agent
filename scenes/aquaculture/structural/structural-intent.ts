import type { IntentPayload, StructuralHistoryTurn } from "@embodied-agent/core";

export function tryStructuralIntentOverride(
  _utterance: string,
  _history?: readonly StructuralHistoryTurn[],
): IntentPayload | null {
  return null;
}
