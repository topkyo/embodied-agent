import { describe, expect, it } from "vitest";
import type { DeviceRegistry, IntentPayload } from "@embodied-agent/core";
import { resolveRobotDeviceTarget } from "./target-resolver.js";

const registry: DeviceRegistry = {
  deployments: [
    {
      deployment_id: "dep-robot-pilot-001",
      name: "M20 试点",
      timezone: "Asia/Shanghai",
      status: "active",
    },
  ],
  entities: [],
  nodes: [
    {
      node_id: "m20-001",
      deployment_id: "dep-robot-pilot-001",
      name: "M20 一号",
      status: "active",
    },
  ],
  devices: [
    {
      device_id: "m20-001",
      deployment_id: "dep-robot-pilot-001",
      device_type: "robot_dog",
      name: "M20 一号",
      aliases: [],
      node_id: "m20-001",
      status: "active",
      transport: "m20_http",
    },
  ],
};

const intent: IntentPayload = {
  skill: "robot.set_gait",
  target: {},
  parameters: { gait: "basic" },
};

describe("resolveRobotDeviceTarget", () => {
  it("fails visibly without deployment context", () => {
    const result = resolveRobotDeviceTarget(intent, registry, {
      deployment_id: "",
      domainConfig: { default_robot_id: "m20-001" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("deployment_id");
    }
  });

  it("resolves only within the current deployment", () => {
    const result = resolveRobotDeviceTarget(intent, registry, {
      deployment_id: "dep-robot-pilot-001",
      domainConfig: { default_robot_id: "m20-001" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.deployment_id).toBe("dep-robot-pilot-001");
    }
  });
});
