import { z } from "zod";
import { P0_SKILLS, P1_SKILLS, P2_SKILLS } from "../skills.js";
import { platformIntentSchemas } from "./intent-platform.js";

export { PHYSICAL_PULSE_MAX_SECONDS } from "./intent-primitives.js";

type PlatformIntentPayload = z.infer<(typeof platformIntentSchemas)[number]>;

export type DomainIntentPayload = {
  intent_id?: string;
  skill: string;
  target: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  confidence?: number;
  requires_confirmation?: boolean;
  raw_text?: string;
};

export type IntentPayload = PlatformIntentPayload | DomainIntentPayload;

export type IntentParseResult = z.SafeParseReturnType<unknown, IntentPayload>;

function intentOptions(domainIntentSchemas: readonly z.ZodTypeAny[] = []): z.ZodTypeAny[] {
  return [...platformIntentSchemas, ...domainIntentSchemas];
}

export function createIntentSchema(
  domainIntentSchemas: readonly z.ZodTypeAny[] = [],
): z.ZodType<IntentPayload> {
  const options = intentOptions(domainIntentSchemas);
  if (options.length === 0) {
    return z.never() as z.ZodType<IntentPayload>;
  }
  if (options.length === 1) {
    return options[0] as unknown as z.ZodType<IntentPayload>;
  }
  return z.union(
    options as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]],
  ) as unknown as z.ZodType<IntentPayload>;
}

export const intentSchema = createIntentSchema();

/** JSON schema enum for LLM structured output (includes P1/P2 for full capability) */
export const LLM_SKILL_ENUM = [
  ...P0_SKILLS,
  ...P1_SKILLS,
  ...P2_SKILLS,
  "clarification_needed",
] as const;

export function createLlmSkillEnum(domainSkills: readonly string[] = []): readonly string[] {
  return [...domainSkills, ...P0_SKILLS, ...P1_SKILLS, ...P2_SKILLS, "clarification_needed"];
}

export function parseIntentPayload(
  data: unknown,
  domainIntentSchemas: readonly z.ZodTypeAny[] = [],
): IntentPayload {
  return createIntentSchema(domainIntentSchemas).parse(data) as IntentPayload;
}

export function safeParseIntentPayload(
  data: unknown,
  domainIntentSchemas: readonly z.ZodTypeAny[] = [],
): IntentParseResult {
  return createIntentSchema(domainIntentSchemas).safeParse(data) as IntentParseResult;
}
