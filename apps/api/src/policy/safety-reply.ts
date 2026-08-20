import type { SafetyDecision } from "@embodied-agent/safety";

export function formatSafetyRejection(decision: SafetyDecision): string {
  if (decision.guidance) {
    return `${decision.reason}\n\n${decision.guidance}`;
  }
  return decision.reason;
}
