import { describe, expect, it } from "vitest";
import {
  detectSkillUtteranceConflict,
  evaluateProEscalation,
  isUserCorrectionUtterance,
} from "./pro-escalation.js";
import { bindTestAgentRuntime } from "../../test/bind-test-runtime.js";

const bindings = bindTestAgentRuntime();

describe("pro-escalation", () => {
  it("detects irrigation utterance vs vent skill", () => {
    expect(
      detectSkillUtteranceConflict(bindings, "2号棚A区开启灌溉15分钟", "greenhouse.open_vent"),
    ).toBe(true);
  });

  it("detects vent utterance vs irrigation skill", () => {
    expect(detectSkillUtteranceConflict(bindings, "打开侧帘10分钟", "irrigation.start")).toBe(true);
  });

  it("no conflict when irrigation matches", () => {
    expect(detectSkillUtteranceConflict(bindings, "2号棚开启灌溉15分钟", "irrigation.start")).toBe(
      false,
    );
  });

  it("flags user correction", () => {
    expect(isUserCorrectionUtterance("开启灌溉不是通风")).toBe(true);
  });

  it("escalates on skill conflict", () => {
    const decision = evaluateProEscalation(bindings, {
      utterance: "2号棚开启灌溉15分钟",
      result: {
        ok: true,
        validation: {
          kind: "intent",
          intent: {
            skill: "greenhouse.open_vent",
            target: { greenhouse_id: "gh-002" },
            parameters: { duration_seconds: 900 },
            confidence: 0.95,
          },
        },
      },
    });
    expect(decision.escalate).toBe(true);
    expect(decision.reason).toBe("skill_utterance_conflict");
  });

  it("force escalation on user correction", () => {
    const decision = evaluateProEscalation(bindings, {
      utterance: "开启灌溉不是通风",
      force: true,
      result: {
        ok: true,
        validation: {
          kind: "intent",
          intent: {
            skill: "irrigation.start",
            target: { zone_id: "zone-b" },
            parameters: { duration_seconds: 900 },
            confidence: 0.95,
          },
        },
      },
    });
    expect(decision.escalate).toBe(true);
    expect(decision.reason).toBe("user_correction");
  });
});
