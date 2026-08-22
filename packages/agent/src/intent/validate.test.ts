import { describe, expect, it } from "vitest";
import { validateLlmJson } from "./validate.js";
import { bindTestAgentRuntime } from "../../test/bind-test-runtime.js";

const bindings = bindTestAgentRuntime();

describe("validateLlmJson", () => {
  it("accepts query_status", () => {
    const r = validateLlmJson(bindings, {
      skill: "greenhouse.query_status",
      target: { greenhouse_id: "gh-001" },
    });
    expect(r.kind).toBe("intent");
  });

  it("repairs string target from LLM", () => {
    const r = validateLlmJson(bindings, {
      skill: "greenhouse.query_status",
      target: "gh-001",
    });
    expect(r.kind).toBe("intent");
    if (r.kind === "intent" && r.intent.skill === "greenhouse.query_status") {
      expect(r.intent.target.greenhouse_id).toBe("gh-001");
    }
  });

  it("accepts fan.start without parameters", () => {
    const r = validateLlmJson(bindings, {
      skill: "fan.start",
      target: { fan_id: "fan-gh-001-01" },
      confidence: 0.9,
    });
    expect(r.kind).toBe("intent");
  });

  it("accepts vent duration per user request without cap rejection", () => {
    const r = validateLlmJson(bindings, {
      skill: "greenhouse.open_vent",
      target: { greenhouse_id: "gh-001" },
      parameters: { duration_seconds: 7200 },
    });
    expect(r.kind).toBe("intent");
    if (r.kind === "intent" && r.intent.skill === "greenhouse.open_vent") {
      expect(r.intent.parameters.duration_seconds).toBe(7200);
    }
  });

  it("rejects vent duration above 4h firmware watchdog", () => {
    const r = validateLlmJson(bindings, {
      skill: "greenhouse.open_vent",
      target: { greenhouse_id: "gh-001" },
      parameters: { duration_seconds: 3600 * 4 + 1 },
    });
    expect(r.kind).toBe("clarification");
    if (r.kind === "clarification") {
      expect(r.repairable).toBe(true);
    }
  });

  it("repairs alert.set_threshold LLM field aliases", () => {
    const r = validateLlmJson(bindings, {
      skill: "alert.set_threshold",
      target: { greenhouse_id: "gh-002" },
      parameters: {
        sensor_type: "temperature",
        threshold: 30,
        direction: "above",
      },
    });
    expect(r.kind).toBe("intent");
    if (r.kind === "intent" && r.intent.skill === "alert.set_threshold") {
      expect(r.intent.parameters.metric).toBe("temperature_c");
      expect(r.intent.parameters.operator).toBe(">");
      expect(r.intent.parameters.value).toBe(30);
    }
  });

  it("repairs report.set_schedule LLM field aliases", () => {
    const r = validateLlmJson(bindings, {
      skill: "report.set_schedule",
      target: { greenhouse_id: "gh-001" },
      parameters: {
        greenhouse_id: "gh-002",
        interval: 15,
      },
    });
    expect(r.kind).toBe("intent");
    if (r.kind === "intent" && r.intent.skill === "report.set_schedule") {
      expect(r.intent.parameters.greenhouse_ids).toContain("gh-001");
      expect(r.intent.parameters.greenhouse_ids).toContain("gh-002");
      expect(r.intent.parameters.interval_minutes).toBe(15);
    }
  });

  it("accepts empty target for platform query skills", () => {
    const r = validateLlmJson(bindings, {
      skill: "alert.query_today",
      target: {},
    });
    expect(r.kind).toBe("intent");
    if (r.kind === "intent" && r.intent.skill === "alert.query_today") {
      expect(r.intent.target).toEqual({});
    }
  });

  it("handles clarification_needed from LLM", () => {
    const r = validateLlmJson(bindings, {
      skill: "clarification_needed",
      clarification: "你要打开哪座温室？",
    });
    expect(r.kind).toBe("clarification");
  });
});
