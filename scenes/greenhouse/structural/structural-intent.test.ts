import { describe, expect, it } from "vitest";
import { tryStructuralIntentOverride } from "./structural-intent.js";

describe("tryStructuralIntentOverride", () => {
  it("clarifies unknown greenhouse number on status query", () => {
    const intent = tryStructuralIntentOverride("三号棚多少度");
    expect(intent?.skill).toBe("clarification_needed");
    expect(intent).toMatchObject({
      clarification: expect.stringContaining("一号棚和二号棚"),
    });
  });
});
