import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { ingestHeartbeatMessage, resetTelemetryCacheForTests } from "../telemetry/store.js";
import type { SceneResolvedDeviceTarget } from "@embodied-agent/runtime";
import { resolveDeviceRuntimeState } from "./runtime-state.js";

let testDir: string;

function makeTarget(manual_override = false): SceneResolvedDeviceTarget {
  return {
    deployment_id: "dep-gh-pilot-001",
    node_id: "node-test-runtime",
    device: {
      device_id: "vent-sim-gh-001",
      deployment_id: "dep-gh-pilot-001",
      entity_id: "gh-001",
      device_type: "vent_motor",
      name: "1 号棚模拟左侧帘",
      aliases: [],
      node_id: "node-test-runtime",
      status: "active",
      manual_override,
    },
  };
}

describe("resolveDeviceRuntimeState", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("runtime-state");
    resetTelemetryCacheForTests();
  });

  afterEach(() => {
    delete process.env.DEVICE_HEARTBEAT_TIMEOUT_MS;
    resetTelemetryCacheForTests();
    releaseAgentDataDir(testDir);
  });

  it("marks devices offline when heartbeat is stale", () => {
    process.env.DEVICE_HEARTBEAT_TIMEOUT_MS = "10";
    ingestHeartbeatMessage({
      message_type: "heartbeat",
      node_id: "node-test-runtime",
    });
    const state = resolveDeviceRuntimeState(makeTarget(), Date.now() + 1000);
    expect(state.status).toBe("offline");
  });

  it("uses registry manual override state", () => {
    const state = resolveDeviceRuntimeState(makeTarget(true));
    expect(state.manual_override).toBe(true);
  });
});
