import { describe, expect, it } from "vitest";
import { riskLevelForPhysicalSkill, riskLevelForScene } from "./risk-level.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";

describe("risk-level", () => {
  const ctx = () => getPlatformRuntimeContext();

  it("maps scene skills to L1/L2", () => {
    expect(riskLevelForScene(ctx(), "night_ventilation_control")).toBe("L2");
    expect(riskLevelForScene(ctx(), "device_efficiency_diagnosis")).toBe("L1");
  });

  it("maps physical skills", () => {
    expect(riskLevelForPhysicalSkill(ctx(), "alert.set_threshold")).toBe("L4");
    expect(
      riskLevelForPhysicalSkill(ctx(), "greenhouse.open_vent", {
        requires_confirmation: true,
      }),
    ).toBe("L3");
  });
});
