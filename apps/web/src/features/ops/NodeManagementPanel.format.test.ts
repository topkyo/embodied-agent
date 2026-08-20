import { describe, expect, it } from "vitest";
import {
  formatNodeEntityLabel,
  formatNodeTechTitle,
  relativeAgeFromIso,
} from "./NodeManagementPanel";

const NOW = Date.parse("2026-07-10T12:00:00.000Z");

describe("relativeAgeFromIso", () => {
  it("returns none for missing or invalid", () => {
    expect(relativeAgeFromIso(undefined, NOW)).toEqual({ unit: "none" });
    expect(relativeAgeFromIso(null, NOW)).toEqual({ unit: "none" });
    expect(relativeAgeFromIso("not-a-date", NOW)).toEqual({ unit: "none" });
  });

  it("buckets just_now / minutes / hours / days", () => {
    expect(relativeAgeFromIso("2026-07-10T11:59:30.000Z", NOW)).toEqual({ unit: "just_now" });
    expect(relativeAgeFromIso("2026-07-10T11:45:00.000Z", NOW)).toEqual({
      unit: "minutes",
      count: 15,
    });
    expect(relativeAgeFromIso("2026-07-10T09:00:00.000Z", NOW)).toEqual({
      unit: "hours",
      count: 3,
    });
    expect(relativeAgeFromIso("2026-07-07T12:00:00.000Z", NOW)).toEqual({
      unit: "days",
      count: 3,
    });
  });

  it("clamps future timestamps to just_now", () => {
    expect(relativeAgeFromIso("2026-07-10T13:00:00.000Z", NOW)).toEqual({ unit: "just_now" });
  });
});

describe("formatNodeEntityLabel", () => {
  it("prefers entity · deployment", () => {
    expect(
      formatNodeEntityLabel({
        node_id: "node-sim-gh-001",
        deployment_id: "dep-gh-pilot-001",
        entity_id: "gh-001",
      }),
    ).toBe("gh-001 · dep-gh-pilot-001");
  });

  it("falls back to node_id without entity", () => {
    expect(
      formatNodeEntityLabel({
        node_id: "node-sim-gh-001",
        deployment_id: "dep-gh-pilot-001",
      }),
    ).toBe("node-sim-gh-001");
  });
});

describe("formatNodeTechTitle", () => {
  it("includes node_id, cv, fw, and absolute hb for hover", () => {
    expect(
      formatNodeTechTitle({
        node_id: "node-sim-gh-001",
        config_version: 5,
        firmware_version: "sim-0.3.0",
        reported_at: "2026-07-10T11:00:00.000Z",
      }),
    ).toBe("node-sim-gh-001 cv=5 fw:sim-0.3.0 hb 2026-07-10T11:00:00.000Z");
  });

  it("omits fw and hb when absent", () => {
    expect(formatNodeTechTitle({ node_id: "n1", config_version: 0 })).toBe("n1 cv=0");
  });
});
