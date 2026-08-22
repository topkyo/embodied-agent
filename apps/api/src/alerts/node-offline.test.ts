import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CANONICAL_SIM_REGISTRY } from "../test/registry-fixture.js";
import { saveRegistry } from "@embodied-agent/node";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import { ingestHeartbeatMessage } from "../telemetry/store.js";
import {
  isNodeOffline,
  listNodeIdsForEntity,
  shouldSkipThresholdAlertForEntity,
} from "./node-offline.js";

let testDir: string;

describe("node-offline", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    seedCanonicalSimRegistry();
    delete process.env.DEVICE_HEARTBEAT_TIMEOUT_MS;
  });
  afterEach(() => {
    delete process.env.DEVICE_HEARTBEAT_TIMEOUT_MS;
    releaseAgentDataDir(testDir);
  });

  it("lists nodes bound to a greenhouse from explicit registry", () => {
    expect(listNodeIdsForEntity("gh-001")).toContain("node-sim-gh-001");
    expect(listNodeIdsForEntity("gh-002")).toEqual(["node-sim-gh-002"]);
  });

  it("detects stale heartbeat as offline", () => {
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
    expect(isNodeOffline("node-sim-gh-001", Date.now() + 120_000)).toBe(true);
  });

  it("skips threshold when all greenhouse nodes are offline", () => {
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
    expect(shouldSkipThresholdAlertForEntity("gh-001", Date.now() + 120_000)).toBe(true);
  });

  it("skips threshold when greenhouse has no bound nodes", () => {
    saveRegistry({
      ...CANONICAL_SIM_REGISTRY,
      nodes: (CANONICAL_SIM_REGISTRY.nodes ?? []).filter((n) => n.entity_id !== "gh-002"),
      devices: CANONICAL_SIM_REGISTRY.devices.filter((d) => d.entity_id !== "gh-002"),
    });
    expect(shouldSkipThresholdAlertForEntity("gh-002")).toBe(true);
  });

  it("does not skip when a greenhouse node is online", () => {
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
    expect(shouldSkipThresholdAlertForEntity("gh-001")).toBe(false);
  });

  it("does not skip when one of multiple nodes is online", () => {
    saveRegistry({
      ...CANONICAL_SIM_REGISTRY,
      nodes: [
        ...(CANONICAL_SIM_REGISTRY.nodes ?? []),
        {
          node_id: "node-a",
          deployment_id: "dep-gh-pilot-001",
          entity_id: "gh-001",
          firmware_version: "test",
          config_version: 1,
          status: "active",
        },
        {
          node_id: "node-b",
          deployment_id: "dep-gh-pilot-001",
          entity_id: "gh-001",
          firmware_version: "test",
          config_version: 1,
          status: "active",
        },
      ],
      devices: [
        ...CANONICAL_SIM_REGISTRY.devices,
        {
          device_id: "vent-a",
          deployment_id: "dep-gh-pilot-001",
          entity_id: "gh-001",
          device_type: "vent_motor",
          name: "A",
          aliases: [],
          node_id: "node-a",
          status: "active",
          channel: "relay:a",
        },
        {
          device_id: "vent-b",
          deployment_id: "dep-gh-pilot-001",
          entity_id: "gh-001",
          device_type: "vent_motor",
          name: "B",
          aliases: [],
          node_id: "node-b",
          status: "active",
          channel: "relay:b",
        },
      ],
    });
    ingestHeartbeatMessage({ node_id: "node-a" });
    expect(shouldSkipThresholdAlertForEntity("gh-001")).toBe(false);
  });
});
