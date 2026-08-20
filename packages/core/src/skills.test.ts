import { describe, expect, it } from "vitest";
import { z } from "zod";
import { P0_SKILL_SET, P0_SKILLS, isP0Skill } from "./skills.js";
import {
  LLM_SKILL_ENUM,
  PHYSICAL_PULSE_MAX_SECONDS,
  createLlmSkillEnum,
  parseIntentPayload,
  safeParseIntentPayload,
} from "./schemas/intent.js";
import { baseIntent, pulseDurationSeconds } from "./schemas/intent-primitives.js";

const TEST_DOMAIN_P0_SKILLS = ["device.query_status", "device.start"] as const;
const TEST_DOMAIN_P1_SKILLS = ["zone.activate"] as const;

const testDomainIntentSchemas = [
  baseIntent.extend({
    skill: z.literal("device.start"),
    target: z.object({ entity_id: z.string().min(1), device_id: z.string().min(1) }).strict(),
    parameters: z.object({ duration_seconds: pulseDurationSeconds }).strict(),
  }),
  baseIntent.extend({
    skill: z.literal("zone.activate"),
    target: z.object({ zone_id: z.string().min(1) }).strict(),
    parameters: z.object({ duration_seconds: pulseDurationSeconds }).strict(),
  }),
] as const;

describe("P0_SKILLS", () => {
  it("platform skills.ts exports empty catalogs — Domain Packs own skill literals", () => {
    expect([...P0_SKILLS]).toEqual([]);
    expect(P0_SKILL_SET.size).toBe(0);
  });

  it("core owns no domain skill literals", () => {
    expect([...P0_SKILLS]).toEqual([]);
    for (const skill of TEST_DOMAIN_P0_SKILLS) {
      expect(P0_SKILLS).not.toContain(skill);
      expect(isP0Skill(skill)).toBe(false);
    }
  });

  it("core static LLM enum excludes Domain Pack skills by default", () => {
    expect(LLM_SKILL_ENUM).toEqual(["clarification_needed"]);
    expect(LLM_SKILL_ENUM).not.toContain("device.start");
    expect(LLM_SKILL_ENUM).not.toContain("zone.activate");
  });

  it("can build a runtime LLM enum with active Domain Pack skills", () => {
    const runtimeEnum = createLlmSkillEnum([...TEST_DOMAIN_P0_SKILLS, ...TEST_DOMAIN_P1_SKILLS]);
    expect(runtimeEnum).toContain("device.start");
    expect(runtimeEnum).toContain("zone.activate");
  });

  it("rejects unknown skill names", () => {
    expect(isP0Skill("gpio.high")).toBe(false);
  });
});

describe("intentSchema", () => {
  it("rejects Domain Pack intents without runtime schema injection", () => {
    const result = safeParseIntentPayload({
      skill: "device.start",
      target: { entity_id: "entity-001", device_id: "actuator-001" },
      parameters: { duration_seconds: 600 },
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid domain intent with runtime schema injection", () => {
    const intent = parseIntentPayload(
      {
        skill: "device.start",
        target: { entity_id: "entity-001", device_id: "actuator-001" },
        parameters: { duration_seconds: 600 },
        confidence: 0.93,
        raw_text: "start actuator for 10 minutes",
      },
      testDomainIntentSchemas,
    );
    expect(intent.skill).toBe("device.start");
    if (intent.skill === "device.start") {
      expect(intent.parameters.duration_seconds).toBe(600);
    }
  });

  it("rejects invalid skill enum", () => {
    const result = safeParseIntentPayload({
      skill: "gpio.set_pin",
      target: { entity_id: "entity-001" },
      parameters: {},
    });
    expect(result.success).toBe(false);
  });

  it("accepts P1 domain skills through runtime schema injection", () => {
    const result = safeParseIntentPayload(
      {
        skill: "zone.activate",
        target: { zone_id: "zone-003" },
        parameters: { duration_seconds: 600 },
      },
      testDomainIntentSchemas,
    );
    expect(result.success).toBe(true);
    if (result.success && result.data.skill === "zone.activate") {
      expect(result.data.target.zone_id).toBe("zone-003");
    }
  });

  it("rejects hardware-level fields in intent", () => {
    const result = safeParseIntentPayload(
      {
        skill: "device.start",
        target: { entity_id: "entity-001", device_id: "actuator-001", gpio: 23 },
        parameters: { duration_seconds: 600 },
      },
      testDomainIntentSchemas,
    );
    expect(result.success).toBe(false);
  });

  it("accepts pulse duration at 4h firmware watchdog boundary", () => {
    const result = safeParseIntentPayload(
      {
        skill: "device.start",
        target: { entity_id: "entity-001", device_id: "actuator-001" },
        parameters: { duration_seconds: PHYSICAL_PULSE_MAX_SECONDS },
      },
      testDomainIntentSchemas,
    );
    expect(result.success).toBe(true);
    if (result.success && result.data.skill === "device.start") {
      expect(result.data.parameters.duration_seconds).toBe(PHYSICAL_PULSE_MAX_SECONDS);
    }
  });

  it("rejects pulse duration above 4h firmware watchdog", () => {
    const result = safeParseIntentPayload(
      {
        skill: "device.start",
        target: { entity_id: "entity-001", device_id: "actuator-001" },
        parameters: { duration_seconds: PHYSICAL_PULSE_MAX_SECONDS + 1 },
      },
      testDomainIntentSchemas,
    );
    expect(result.success).toBe(false);
  });
});
