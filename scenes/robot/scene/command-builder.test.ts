import { describe, expect, it } from "vitest";
import type { IntentPayload, SceneResolvedDeviceTarget } from "@embodied-agent/core";
import { buildRobotCommandPatch } from "./command-builder.js";

const target = {} as SceneResolvedDeviceTarget;

function intent(skill: string, parameters?: Record<string, unknown>): IntentPayload {
  return { skill, target: {}, parameters };
}

describe("buildRobotCommandPatch", () => {
  it("maps robot physical skills through an explicit action table", () => {
    expect(buildRobotCommandPatch(intent("robot.sit_down"), target)?.action).toBe("sit_down");
    expect(
      buildRobotCommandPatch(intent("robot.gimbal_move", { direction: "left" }), target),
    ).toEqual({
      action: "gimbal_move",
      parameters: { direction: "left" },
    });
  });

  it("does not cast unknown robot skills into command actions", () => {
    expect(buildRobotCommandPatch(intent("robot.not_real"), target)).toBeNull();
    expect(buildRobotCommandPatch(intent("robot.start_inspection"), target)).toBeNull();
  });
});
