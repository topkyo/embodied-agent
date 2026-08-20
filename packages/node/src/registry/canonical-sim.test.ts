import { describe, expect, it } from "vitest";
import { buildCanonicalSimRegistry } from "@embodied-agent/domain-agriculture";

describe("canonical sim registry (entity pack)", () => {
  it("buildCanonicalSimRegistry has dual entities", () => {
    const registry = buildCanonicalSimRegistry();
    expect(registry.entities.map((g) => g.entity_id).sort()).toEqual(["gh-001", "gh-002"]);
  });

  it("each entity has vent motor default", () => {
    const registry = buildCanonicalSimRegistry();
    for (const ghId of ["gh-001", "gh-002"] as const) {
      const vent = registry.devices.find(
        (d) => d.entity_id === ghId && d.device_type === "vent_motor",
      );
      expect(vent?.device_id).toBeDefined();
    }
  });
});
