import { describe, expect, it } from "vitest";
import { ROBOT_INTENT_PROCESSING } from "./intent-processing.js";

describe("ROBOT_INTENT_PROCESSING", () => {
  it("fills default body source for inspection intents", () => {
    const intent = ROBOT_INTENT_PROCESSING.refineIntentFromUtterance?.("去充电桩巡检取证", {
      skill: "robot.start_inspection",
      target: {},
      parameters: { waypoint_id: "dock", objective: "巡检取证" },
    });
    expect(intent?.skill).toBe("robot.start_inspection");
    if (intent?.skill === "robot.start_inspection") {
      const params = intent.parameters as { source?: string };
      expect(params.source).toBe("body");
    }
  });

  it("rejects unsupported work light status queries", () => {
    const intent = ROBOT_INTENT_PROCESSING.refineIntentFromUtterance?.("工作灯状态", {
      skill: "robot.query_status",
      target: {},
    });
    expect(intent?.skill).toBe("clarification_needed");
  });

  it("rejects negated physical control requests", () => {
    const intent = ROBOT_INTENT_PROCESSING.refineIntentFromUtterance?.("不要打开工作灯", {
      skill: "robot.set_light",
      target: {},
      parameters: { light: "work", state: "off" },
    });
    expect(intent?.skill).toBe("clarification_needed");
  });

  it("normalizes body LED brightness values to switches", () => {
    const normalized = ROBOT_INTENT_PROCESSING.normalizeLlmShape?.({
      skill: "robot.set_body_led",
      target: {},
      parameters: { front: 255, back: true },
    }) as { parameters?: { front?: number; back?: number } };
    expect(normalized.parameters).toMatchObject({ front: 1, back: 1 });
  });
});
