import { describe, expect, it } from "vitest";
import type { IntentPayload, SceneResolvedDeviceTarget } from "@embodied-agent/core";
import { buildIndustrialCommandPatch } from "./command-builder.js";

const target: SceneResolvedDeviceTarget = {
  deployment_id: "dep-industrial-001",
  node_id: "node-industrial-001",
  device: {
    device_id: "fan-001",
    deployment_id: "dep-industrial-001",
    entity_id: "cabinet-001",
    device_type: "fan",
    name: "排风",
    aliases: [],
    node_id: "node-industrial-001",
    status: "active",
  },
};

function intent(skill: string, parameters?: Record<string, unknown>): IntentPayload {
  return { skill, target: {}, parameters };
}

describe("buildIndustrialCommandPatch", () => {
  it("builds start and stop exhaust command patches", () => {
    expect(
      buildIndustrialCommandPatch(
        intent("industrial.start_exhaust", { duration_seconds: 600 }),
        target,
      ),
    ).toEqual({
      device_type: "fan",
      action: "start",
      parameters: { duration_seconds: 600 },
    });
    expect(buildIndustrialCommandPatch(intent("industrial.stop_exhaust"), target)).toEqual({
      device_type: "fan",
      action: "stop",
    });
  });

  it("returns null for unknown skill", () => {
    expect(buildIndustrialCommandPatch(intent("industrial.not_real"), target)).toBeNull();
  });
});
