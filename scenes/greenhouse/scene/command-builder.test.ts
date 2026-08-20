import { describe, expect, it } from "vitest";
import type { IntentPayload, SceneResolvedDeviceTarget } from "@embodied-agent/core";
import { buildGreenhouseCommandPatch } from "./command-builder.js";

const target: SceneResolvedDeviceTarget = {
  deployment_id: "dep-greenhouse-001",
  node_id: "node-greenhouse-001",
  device: {
    device_id: "device-001",
    deployment_id: "dep-greenhouse-001",
    entity_id: "gh-001",
    device_type: "fan",
    name: "风机",
    aliases: [],
    node_id: "node-greenhouse-001",
    status: "active",
  },
};

function intent(skill: string, parameters?: Record<string, unknown>): IntentPayload {
  return { skill, target: {}, parameters };
}

describe("buildGreenhouseCommandPatch", () => {
  it("builds vent, mode, fan and irrigation patches", () => {
    expect(
      buildGreenhouseCommandPatch(
        intent("greenhouse.open_vent", { duration_seconds: 300 }),
        target,
      ),
    ).toEqual({
      action: "open",
      parameters: { duration_seconds: 300 },
    });
    expect(
      buildGreenhouseCommandPatch(
        intent("greenhouse.close_vent", { duration_seconds: 300 }),
        target,
      ),
    ).toEqual({
      action: "close",
      parameters: { duration_seconds: 300 },
    });
    expect(buildGreenhouseCommandPatch(intent("greenhouse.stop_vent"), target)).toEqual({
      action: "stop",
    });
    expect(
      buildGreenhouseCommandPatch(
        intent("greenhouse.set_mode", { mode: "night_vent", max_temp_c: 32, temp_low_c: 30 }),
        target,
      ),
    ).toEqual({
      action: "set_mode",
      parameters: {
        mode: "night_vent",
        max_temp_c: 32,
        temp_high_c: undefined,
        temp_low_c: 30,
        until_iso: undefined,
      },
    });
    expect(
      buildGreenhouseCommandPatch(intent("fan.start", { duration_seconds: 480 }), target),
    ).toEqual({
      action: "start",
      parameters: { duration_seconds: 480 },
    });
    expect(buildGreenhouseCommandPatch(intent("fan.stop"), target)).toEqual({ action: "stop" });
    expect(
      buildGreenhouseCommandPatch(intent("irrigation.start", { duration_seconds: 1200 }), target),
    ).toEqual({
      device_type: "fan",
      action: "start",
      parameters: { duration_seconds: 1200 },
    });
    expect(buildGreenhouseCommandPatch(intent("irrigation.stop"), target)).toEqual({
      device_type: "fan",
      action: "stop",
    });
  });

  it("returns null for unknown skill", () => {
    expect(buildGreenhouseCommandPatch(intent("greenhouse.not_real"), target)).toBeNull();
  });
});
