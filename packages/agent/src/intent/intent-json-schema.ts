import type { AgentRuntimeBindings } from "../runtime-bindings.js";

/** OpenAI / DeepSeek compatible JSON Schema for structured intent output */
export function intentOutputJsonSchema(bindings: AgentRuntimeBindings): Record<string, unknown> {
  const skills = bindings.getIntentSkillEnum(bindings.getEffectiveSettings());
  return {
    type: "object",
    properties: {
      skill: {
        type: "string",
        enum: skills,
      },
      target: {
        type: "object",
        additionalProperties: true,
      },
      parameters: {
        type: "object",
        additionalProperties: true,
      },
      confidence: { type: "number" },
      clarification: { type: "string" },
      requires_confirmation: { type: "boolean" },
      raw_text: { type: "string" },
    },
    required: ["skill"],
    additionalProperties: false,
  };
}

export function intentResponseFormat(
  bindings: AgentRuntimeBindings,
  strict: boolean,
): Record<string, unknown> {
  if (!strict) {
    return { type: "json_object" };
  }
  return {
    type: "json_schema",
    json_schema: {
      name: "agent_intent",
      /** strict:true 与 nested additionalProperties 在部分提供商不兼容；仍约束 skill 枚举 */
      strict: false,
      schema: intentOutputJsonSchema(bindings),
    },
  };
}

export function useStrictJsonSchema(): boolean {
  return process.env.LLM_STRICT_JSON !== "0";
}
