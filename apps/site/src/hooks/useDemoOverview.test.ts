import { describe, expect, it } from "vitest";
import type { AdminOverviewEntity } from "../api/settings.js";
import { pickDemoEntity } from "./useDemoOverview.js";

function entity(
  partial: Partial<AdminOverviewEntity> & { entity_id: string },
): AdminOverviewEntity {
  return {
    entity_type: "greenhouse",
    stale: false,
    ...partial,
  };
}

describe("pickDemoEntity", () => {
  it("prefers gh-001 with greenhouse telemetry", () => {
    const entities = [
      entity({
        entity_id: "gh-002",
        reported_at: "2026-01-01T00:00:00Z",
        telemetry: { temperature_c: 20 },
      }),
      entity({
        entity_id: "gh-001",
        reported_at: "2026-01-01T00:00:00Z",
        telemetry: { temperature_c: 28.5 },
      }),
    ];
    expect(pickDemoEntity("greenhouse", entities)?.entity_id).toBe("gh-001");
  });

  it("picks industrial cabinet-001 then domain_id", () => {
    expect(
      pickDemoEntity("industrial", [
        entity({ entity_id: "other", domain_id: "industrial" }),
        entity({ entity_id: "cabinet-001" }),
      ])?.entity_id,
    ).toBe("cabinet-001");
  });

  it("picks robotics m20-001 then domain_id", () => {
    expect(
      pickDemoEntity("robot", [
        entity({ entity_id: "other", domain_id: "robotics" }),
        entity({ entity_id: "m20-001" }),
      ])?.entity_id,
    ).toBe("m20-001");
  });
});
