import { describe, expect, it } from "vitest";
import { buildAlertMessage, metricBreaches, metricValue, ruleKey } from "./evaluator.js";
import { domainAlertMetricFormatter } from "./metric-formatter.js";
import type { AlertRule } from "./threshold-store.js";

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
      domainAlertMetricFormatter,
    );
    expect(msg).toContain("【报警】");
    expect(msg).toContain("31.2°C");
    expect(msg).toContain(">30°C");
  });

  it("metricValue picks field", () => {
    const t = {
      entity_id: "gh-001",
      temperature_c: 10,
      humidity_percent: 55,
      reported_at: "",
    };
    expect(metricValue(t, "humidity_percent")).toBe(55);
    expect(ruleKey(rule)).toBe("gh-001:temperature_c:>:30");
  });
});
