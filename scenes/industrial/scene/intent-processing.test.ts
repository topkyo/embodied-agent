import { describe, expect, it } from "vitest";
import { INDUSTRIAL_INTENT_PROCESSING } from "./intent-processing.js";

describe("INDUSTRIAL_INTENT_PROCESSING", () => {
  it("converts duration minutes", () => {
    const normalized = INDUSTRIAL_INTENT_PROCESSING.normalizeLlmShape?.({
      skill: "industrial.start_exhaust",
      target: {},
      parameters: { duration_minutes: 10 },
    }) as { target?: { cabinet_id?: string }; parameters?: { duration_seconds?: number } };
    expect(normalized.parameters?.duration_seconds).toBe(600);
  });

  it("rejects cross-domain hints", () => {
    const intent = INDUSTRIAL_INTENT_PROCESSING.refineIntentFromUtterance?.(
      "像 greenhouse 那样开风机",
      {
        skill: "industrial.start_exhaust",
        target: {},
        parameters: { duration_seconds: 600 },
      },
    );
    expect(intent?.skill).toBe("clarification_needed");
  });
});
