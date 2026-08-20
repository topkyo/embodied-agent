import { describe, expect, it } from "vitest";
import { resolveSceneForTrigger, resolveSceneFromIntent } from "./registry.js";

describe("scene registry", () => {
  it("maps sustained temp L2 to night ventilation", () => {
    expect(resolveSceneForTrigger({ type: "sustained_temp_l2" })).toBe("night_ventilation_control");
  });

  it("maps high sustained temp L1 to emergency response", () => {
    expect(
      resolveSceneForTrigger({
        type: "sustained_temp_l1",
        threshold_c: 35,
        current_c: 36,
      }),
    ).toBe("high_temp_emergency_response");
  });

  it("maps moderate sustained temp L1 to night ventilation", () => {
    expect(
      resolveSceneForTrigger({
        type: "sustained_temp_l1",
        threshold_c: 30,
        current_c: 31,
      }),
    ).toBe("night_ventilation_control");
  });

  it("maps all policy triggers", () => {
    expect(resolveSceneForTrigger({ type: "sustained_humidity_l2" })).toBe(
      "humidity_mildew_prevention",
    );
    expect(resolveSceneForTrigger({ type: "weather_cold" })).toBe("cold_wave_protection");
    expect(resolveSceneForTrigger({ type: "weather_heat_l2" })).toBe("night_ventilation_control");
    expect(resolveSceneForTrigger({ type: "irrigation_completed" })).toBe(
      "post_irrigation_ventilation",
    );
    expect(resolveSceneForTrigger({ type: "digest_morning_high_humidity" })).toBe(
      "morning_dew_reduction",
    );
    expect(resolveSceneForTrigger({ type: "manual_override_reject" })).toBe(
      "worker_manual_override_review",
    );
    expect(resolveSceneForTrigger({ type: "device_repeated_failure" })).toBe(
      "device_efficiency_diagnosis",
    );
  });

  it("maps user intents", () => {
    expect(
      resolveSceneFromIntent({
        skill: "greenhouse.set_mode",
        target: { greenhouse_id: "gh-001" },
        parameters: { mode: "night_vent", max_temp_c: 30 },
        confidence: 0.9,
      }),
    ).toBe("night_ventilation_control");
    expect(
      resolveSceneFromIntent({
        skill: "greenhouse.open_vent",
        target: { greenhouse_id: "gh-001" },
        parameters: { duration_seconds: 600 },
        confidence: 0.9,
      }),
    ).toBeNull();
    expect(
      resolveSceneFromIntent({
        skill: "irrigation.start",
        target: { zone_id: "zone-a", greenhouse_id: "gh-001" },
        parameters: { duration_seconds: 300 },
        confidence: 0.9,
      }),
    ).toBeNull();
  });
});
