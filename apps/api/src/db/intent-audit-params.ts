import type { IntentPayload } from "@embodied-agent/core";

export function buildIntentAuditParams(intent: IntentPayload): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (intent.target && Object.keys(intent.target).length > 0) {
    params.target = intent.target;
  }
  if (intent.parameters && Object.keys(intent.parameters).length > 0) {
    params.parameters = intent.parameters;
  }
  if (typeof intent.confidence === "number" && Number.isFinite(intent.confidence)) {
    params.confidence = intent.confidence;
  }
  return params;
}
