import { describe, expect, it } from "vitest";
import { refineIntentFromUtterance } from "./normalize.js";
import { bindTestAgentRuntime } from "../../test/bind-test-runtime.js";

const bindings = bindTestAgentRuntime();

describe("refineIntentFromUtterance", () => {
  it("maps 不超过 to operator <= for alert.set_threshold", () => {
    const intent = refineIntentFromUtterance(bindings, "1号棚温度不超过28度", {
      skill: "alert.set_threshold",
      target: { greenhouse_id: "gh-001" },
      parameters: {
        metric: "temperature_c",
        operator: ">",
        value: 28,
      },
    });
    if (intent.skill === "alert.set_threshold") {
      expect(intent.parameters.operator).toBe("<=");
    }
  });

  it("leaves non-alert skills unchanged", () => {
    const intent = refineIntentFromUtterance(bindings, "1号棚现在多少度", {
      skill: "greenhouse.query_status",
      target: { greenhouse_id: "gh-001" },
    });
    expect(intent.skill).toBe("greenhouse.query_status");
  });
});
