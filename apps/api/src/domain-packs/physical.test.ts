import { getPlatformRuntimeContext } from "../runtime/context.js";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DeviceRegistry, IntentPayload } from "@embodied-agent/core";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { saveRegistry } from "@embodied-agent/node";
import { saveSettings } from "../settings/store.js";
import { preloadDomainPacks } from "./loader.js";
import { resolveDeviceTarget } from "@embodied-agent/runtime";

let testDir: string;

const ROBOT_DEPLOYMENT_ID = "dep-robot-pilot-001";

function robotRegistry(): DeviceRegistry {
  return {
    deployments: [
      {
        deployment_id: ROBOT_DEPLOYMENT_ID,
        name: "M20 试点",
        timezone: "Asia/Shanghai",
        status: "active",
      },
    ],
    entities: [],
    nodes: [
      {
        node_id: "m20-001",
        deployment_id: ROBOT_DEPLOYMENT_ID,
        name: "M20 一号",
        status: "active",
      },
      {
        node_id: "m20-002",
        deployment_id: ROBOT_DEPLOYMENT_ID,
        name: "M20 二号",
        status: "active",
      },
    ],
    devices: [
      {
        device_id: "m20-001",
        deployment_id: ROBOT_DEPLOYMENT_ID,
        device_type: "robot_dog",
        name: "M20 一号",
        aliases: ["一号机器狗"],
        node_id: "m20-001",
        status: "active",
        transport: "m20_http",
      },
      {
        device_id: "m20-002",
        deployment_id: ROBOT_DEPLOYMENT_ID,
        device_type: "robot_dog",
        name: "M20 二号",
        aliases: ["二号机器狗"],
        node_id: "m20-002",
        status: "active",
        transport: "m20_http",
      },
    ],
  };
}

function robotIntentWithoutTarget(): IntentPayload {
  return {
    skill: "robot.set_gait",
    target: {},
    parameters: { gait: "basic" },
  };
}

describe("domain pack physical resolver", () => {
  beforeAll(async () => {
    await preloadDomainPacks(getPlatformRuntimeContext().loader, { packIds: ["robotics"] });
  });

  beforeEach(() => {
    testDir = allocateAgentDataDir("scene-pack-physical");
    saveRegistry(robotRegistry());
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("uses settings.domain_configs.robotics.default_robot_id for robot intents without target", () => {
    process.env.ACTIVE_DOMAIN = "robotics";
    saveSettings({
      deployment_id: ROBOT_DEPLOYMENT_ID,
      active_domain: "robotics",
      domain_configs: {
        robotics: {
          m20_base_url: "http://127.0.0.1:18080",
          default_robot_id: "m20-002",
        },
      },
    });

    const resolved = resolveDeviceTarget(getPlatformRuntimeContext(), robotIntentWithoutTarget());

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.target.device.device_id).toBe("m20-002");
      expect(resolved.target.transport).toBe("m20_http");
    }
  });

  it("fails visibly when robot intent omits robot_id and default_robot_id is missing", () => {
    process.env.ACTIVE_DOMAIN = "robotics";
    saveSettings({
      deployment_id: ROBOT_DEPLOYMENT_ID,
      active_domain: "robotics",
      domain_configs: {
        robotics: {
          m20_base_url: "http://127.0.0.1:18080",
        },
      },
    });

    const resolved = resolveDeviceTarget(getPlatformRuntimeContext(), robotIntentWithoutTarget());

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.reason).toContain("default_robot_id");
    }
  });

  it("blocks explicit robot targets outside the readiness default robot", () => {
    process.env.ACTIVE_DOMAIN = "robotics";
    saveSettings({
      deployment_id: ROBOT_DEPLOYMENT_ID,
      active_domain: "robotics",
      domain_configs: {
        robotics: {
          m20_base_url: "http://127.0.0.1:18080",
          default_robot_id: "m20-001",
        },
      },
    });

    const resolved = resolveDeviceTarget(getPlatformRuntimeContext(), {
      skill: "robot.set_gait",
      target: { robot_id: "m20-002" },
      parameters: { gait: "basic" },
    });

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.reason).toContain("default_robot_id");
    }
  });

  it("blocks explicit robot targets when default_robot_id is missing", () => {
    process.env.ACTIVE_DOMAIN = "robotics";
    saveSettings({
      deployment_id: ROBOT_DEPLOYMENT_ID,
      active_domain: "robotics",
      domain_configs: {
        robotics: {
          m20_base_url: "http://127.0.0.1:18080",
        },
      },
    });

    const resolved = resolveDeviceTarget(getPlatformRuntimeContext(), {
      skill: "robot.set_gait",
      target: { robot_id: "m20-001" },
      parameters: { gait: "basic" },
    });

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.reason).toContain("default_robot_id");
    }
  });
});
