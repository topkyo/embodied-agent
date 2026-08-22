import { describe, expect, it } from "vitest";
import { buildCanonicalSimRegistry } from "../registry/canonical-sim.js";
import {
  parseFlywheelGreenhouseIds,
  resolveFlywheelNodes,
  resolveGreenhouseFlywheelReadiness,
  validateGreenhouseConfig,
} from "./flywheel-readiness.js";

describe("greenhouse flywheel readiness", () => {
  const registry = buildCanonicalSimRegistry();

  it("requires flywheel_greenhouse_ids in domain config", () => {
    expect(validateGreenhouseConfig({})).toEqual([
      expect.objectContaining({ code: "flywheel_greenhouse_ids_missing" }),
    ]);
    expect(validateGreenhouseConfig({ flywheel_greenhouse_ids: ["gh-001", "gh-002"] })).toEqual([]);
  });

  it("derives required nodes from registry devices", () => {
    expect(resolveFlywheelNodes(registry, "dep-gh-pilot-001", ["gh-001", "gh-002"])).toEqual([
      "node-sim-gh-001",
      "node-sim-gh-002",
    ]);
  });

  it("builds flywheel readiness from config + registry", () => {
    const spec = resolveGreenhouseFlywheelReadiness(registry, "dep-gh-pilot-001", {
      flywheel_greenhouse_ids: ["gh-001", "gh-002"],
    });
    expect(spec.requiredNodes).toEqual(["node-sim-gh-001", "node-sim-gh-002"]);
    expect(spec.requiredTelemetry).toEqual([
      { entity_id: "gh-001", metric: "temperature_c" },
      { entity_id: "gh-002", metric: "temperature_c" },
    ]);
    expect(parseFlywheelGreenhouseIds({ flywheel_greenhouse_ids: [" gh-001 ", "gh-001"] })).toEqual(
      ["gh-001"],
    );
  });

  it("fails visibly when flywheel_greenhouse_ids is missing", async () => {
    const spec = resolveGreenhouseFlywheelReadiness(registry, "dep-gh-pilot-001", {});
    expect(spec.requiredNodes).toEqual([]);
    const checks = await spec.probe?.({
      deployment_id: "dep-gh-pilot-001",
      now: Date.now(),
      services: { isSustainedAlertReady: () => true },
    });
    expect(checks).toEqual([
      expect.objectContaining({
        id: "flywheel_greenhouse_ids_missing",
        ok: false,
        severity: "error",
      }),
    ]);
  });
});
