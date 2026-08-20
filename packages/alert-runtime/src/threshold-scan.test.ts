import { describe, expect, it } from "vitest";
import { evaluateThresholdBreach, thresholdAlertKey } from "./threshold-scan.js";
import { defaultAlertMetricFormatter } from "./evaluator.js";
import type { AlertRule } from "./types.js";

const rule: AlertRule = {
  entity_id: "gh-001",
  metric: "temperature_c",
  operator: ">",
  value: 30,
  enabled: true,
  updated_at: "2026-06-04T00:00:00.000Z",
  updated_by: "owner-001",
};

const telemetry = {
  entity_id: "gh-001",
  temperature_c: 31.2,
  humidity_percent: 78,
  vent_status: "closed",
  fan_status: "off",
  reported_at: "2026-06-04T08:00:00.000Z",
};

describe("threshold scan", () => {
  it("returns null when telemetry is missing", () => {
    expect(evaluateThresholdBreach(rule, undefined)).toBeNull();
  });

  it("evaluates breach and builds message", () => {
    const result = evaluateThresholdBreach(rule, telemetry, defaultAlertMetricFormatter);
    expect(result).toMatchObject({
      value: 31.2,
      breaching: true,
    });
    expect(result?.message).toContain("31.2");
    expect(result?.message).toContain("gh-001");
  });

  it("reports non-breaching values", () => {
    const result = evaluateThresholdBreach(
      rule,
      { ...telemetry, temperature_c: 28 },
      defaultAlertMetricFormatter,
    );
    expect(result).toMatchObject({
      value: 28,
      breaching: false,
    });
  });

  it("builds stable alert keys", () => {
    expect(thresholdAlertKey("dep-gh-pilot-001", rule)).toBe(
      "dep-gh-pilot-001:gh-001:temperature_c:>:30",
    );
  });
});
