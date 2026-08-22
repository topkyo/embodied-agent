import type { IntentPayload } from "@embodied-agent/core";
import type { AgentRuntimeBindings } from "../runtime-bindings.js";
import { clarificationMessage } from "./clarify.js";
import { normalizeLlmShape } from "./normalize.js";

export type ValidatedIntent = {
  kind: "intent";
  intent: IntentPayload;
};

export type ClarificationNeeded = {
  kind: "clarification";
  message: string;
  /** Zod/schema mismatch — eligible for one-shot LLM repair */
  repairable?: boolean;
  zodError?: string;
  attempted?: unknown;
};

export type IntentValidationResult = ValidatedIntent | ClarificationNeeded;

export function validateLlmJson(
  bindings: AgentRuntimeBindings,
  data: unknown,
): IntentValidationResult {
  const normalized = normalizeLlmShape(bindings, data);
  if (
    normalized &&
    typeof normalized === "object" &&
    "skill" in normalized &&
    (normalized as { skill: string }).skill === "clarification_needed"
  ) {
    const hint =
      "clarification" in normalized &&
      typeof (normalized as { clarification: unknown }).clarification === "string"
        ? (normalized as { clarification: string }).clarification
        : undefined;
    return { kind: "clarification", message: clarificationMessage(hint) };
  }

  const parsed = bindings.safeParseIntentPayload(normalized, bindings.getEffectiveSettings());
  if (!parsed.success) {
    return {
      kind: "clarification",
      message: clarificationMessage("指令格式无法识别"),
      repairable: true,
      zodError: parsed.error.message,
      attempted: normalized,
    };
  }

  return { kind: "intent", intent: parsed.data };
}
