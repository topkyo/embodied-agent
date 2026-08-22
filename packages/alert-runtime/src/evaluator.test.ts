import { describe, expect, it } from "vitest";
import {
  buildAlertMessage,
  defaultAlertMetricFormatter,
  metricBreaches,
  metricValue,
  ruleKey,
} from "./evaluator.js";
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

describe("alert evaluator", () => {
  it("detects breach", () => {
    expect(metricBreaches(31.2, ">", 30)).toBe(true);
    expect(metricBreaches(30, ">", 30)).toBe(false);
    expect(metricBreaches(30, ">=", 30)).toBe(true);
  });

  it("builds alert message", () => {
    const msg = buildAlertMessage(
      rule,
      {
        entity_id: "gh-001",
        reported_at: "2026-06-04T08:00:00.000Z",
        temperature_c: 31.2,
      },
      defaultAlertMetricFormatter,
    );
    expect(msg).toContain("31.2");
    expect(msg).toContain("gh-001");
  });

  it("reads metric value", () => {
    expect(metricValue({ entity_id: "gh-001", temperature_c: 28 }, "temperature_c")).toBe(28);
  });

  it("builds rule key", () => {
    expect(ruleKey(rule)).toBe("gh-001:temperature_c:>:30");
  });
});
