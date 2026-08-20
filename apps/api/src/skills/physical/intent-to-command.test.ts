import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IntentPayload } from "@embodied-agent/core";
import { loadRegistry } from "@embodied-agent/node";
import { allocateAgentDataDir, releaseAgentDataDir } from "../../test/isolated-data-dir.js";
import { seedCanonicalSimRegistry } from "../../test/registry-fixture.js";
import { intentToCommand } from "./intent-to-command.js";
import type { RouteContext } from "../route-context.js";
import type { SceneResolvedDeviceTarget } from "@embodied-agent/runtime";

let testDir: string;

const ctx: RouteContext = {
  user_id: "u-001",
  role: "owner",
  model: "mock",
  platform: "dev",
  conversation_id: "conv-001",
};

function ventTarget(): SceneResolvedDeviceTarget {
  const device = loadRegistry().devices.find((d) => d.device_id === "vent-sim-gh-001");
  if (!device) throw new Error("vent-sim-gh-001 missing from registry fixture");
  return {
    deployment_id: "dep-gh-pilot-001",
    node_id: "node-sim-gh-001",
    config_version: 1,
    device,
  };
}

describe("intentToCommand", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("intent-to-command");
    seedCanonicalSimRegistry();
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("maps open_vent to open action with duration", () => {
    const intent: IntentPayload = {
      intent_id: "intent-001",
      skill: "greenhouse.open_vent",
      target: { greenhouse_id: "gh-001" },
      parameters: { duration_seconds: 600 },
    };
    const cmd = intentToCommand(intent, ctx, ventTarget());
    expect(cmd).not.toBeNull();
    expect(cmd?.action).toBe("open");
    expect(cmd?.parameters).toEqual({ duration_seconds: 600 });
    expect(cmd?.device_id).toBe("vent-sim-gh-001");
    expect(cmd?.intent_id).toBe("intent-001");
  });

  it("generates intent_id when missing", () => {
    const intent: IntentPayload = {
      skill: "greenhouse.open_vent",
      target: { greenhouse_id: "gh-001" },
      parameters: { duration_seconds: 600 },
    };
    const cmd = intentToCommand(intent, ctx, ventTarget());
    expect(cmd?.intent_id).toMatch(/^intent-/);
    expect(intent.intent_id).toBe(cmd?.intent_id);
  });

  it("returns null for fan.start without duration", () => {
    const intent: IntentPayload = {
      skill: "fan.start",
      target: { fan_id: "fan-sim-gh-001" },
      parameters: {},
    };
    expect(intentToCommand(intent, ctx, ventTarget())).toBeNull();
  });

  it("maps irrigation.start to valve device type", () => {
    const device = loadRegistry().devices.find((d) => d.device_id === "irrigation-sim-gh-001");
    if (!device) throw new Error("irrigation-sim-gh-001 missing from registry fixture");
    const intent: IntentPayload = {
      skill: "irrigation.start",
      target: { greenhouse_id: "gh-001", zone: "zone-a" },
      parameters: { duration_seconds: 300 },
    };
    const cmd = intentToCommand(intent, ctx, {
      deployment_id: "dep-gh-pilot-001",
      node_id: "node-sim-gh-001",
      config_version: 1,
      device,
    });
    expect(cmd?.device_type).toBe("irrigation_valve");
    expect(cmd?.action).toBe("start");
  });
});
