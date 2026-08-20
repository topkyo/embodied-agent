import { describe, expect, it } from "vitest";
import { GREENHOUSE_INTENT_PROCESSING } from "./intent-processing.js";

describe("GREENHOUSE_INTENT_PROCESSING", () => {
  it("normalizes llm duration fields", () => {
    const normalizeLlmShape = GREENHOUSE_INTENT_PROCESSING.normalizeLlmShape as (
      data: unknown,
    ) => unknown;
    expect(
      normalizeLlmShape({
        skill: "fan.start",
        target: { greenhouse_id: "gh-001" },
        parameters: { duration_minutes: 15 },
      }),
    ).toEqual({
      skill: "fan.start",
      target: { greenhouse_id: "gh-001", fan_id: "fan-gh-001-01" },
      parameters: { duration_seconds: 900 },
    });
  });

  it("refines utterance conflicts across domains", () => {
    const refineIntentFromUtterance = GREENHOUSE_INTENT_PROCESSING.refineIntentFromUtterance as (
      utterance: string,
      intent: unknown,
    ) => unknown;
    expect(
      refineIntentFromUtterance("机器狗打开工作灯", {
        skill: "greenhouse.query_status",
        target: {},
      } as never),
    ).toEqual({
      skill: "clarification_needed",
      target: {},
      clarification: "当前启用的是 agriculture Domain Pack，机器人相关指令不在本场景内。",
    });
  });

  it("keeps greenhouse status clarification for unknown greenhouse numbers", () => {
    const refineIntentFromUtterance = GREENHOUSE_INTENT_PROCESSING.refineIntentFromUtterance as (
      utterance: string,
      intent: unknown,
    ) => unknown;
    expect(
      refineIntentFromUtterance("三号棚多少度", {
        skill: "greenhouse.query_status",
        target: {},
      } as never),
    ).toEqual({
      skill: "clarification_needed",
      target: {},
      clarification: "当前只有 1 号棚和 2 号棚，请确认要操作或查询哪个棚。",
    });
  });
});
