import { allocateAgentDataDir, releaseAgentDataDir } from "@embodied-agent/platform";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeviceRegistry } from "@embodied-agent/core";
import { saveRegistry } from "../registry/store.js";
import { applyNodeBinding, upsertNodeInRegistry } from "./registry.js";

const CANONICAL_SIM_REGISTRY: DeviceRegistry = {
  deployments: [
    {
      deployment_id: "dep-001",
      name: "Test Deployment",
      timezone: "Asia/Shanghai",
      status: "active",
    },
  ],
  entities: [
    {
      deployment_id: "dep-001",
      domain_id: "test-domain",
      entity_type: "test-entity",
      entity_id: "entity-001",
      name: "Test Entity",
      aliases: ["entity"],
      status: "active",
    },
  ],
  nodes: [
    {
      node_id: "node-001",
      deployment_id: "dep-001",
      entity_id: "entity-001",
      status: "pending",
      config_version: 0,
    },
  ],
  devices: [],
};

let testDir: string;

describe("applyNodeBinding", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    saveRegistry(CANONICAL_SIM_REGISTRY);
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("persists registry_device_id when binding supplies canonical device mapping", () => {
    const result = applyNodeBinding("node-001", "dep-001", "entity-001", [
      {
        device_id: "device-runtime-001",
        registry_device_id: "device-registry-001",
        device_type: "entity_controller",
        name: "Controller",
        default_for: "entity_controller",
        status: "active",
      },
    ]);

    const controller = result.registry.devices.find(
      (d) => d.node_id === "node-001" && d.device_type === "entity_controller",
    );
    expect(controller?.device_id).toBe("device-registry-001");
  });

  it("persists zone_id from binding devices", () => {
    const result = applyNodeBinding("node-001", "dep-001", "entity-001", [
      {
        device_id: "device-zone-001",
        device_type: "zone_valve",
        name: "Zone A Valve",
        default_for: "zone_control",
        zone_id: "zone-a",
        status: "active",
      },
    ]);

    const valve = result.registry.devices.find(
      (d) => d.node_id === "node-001" && d.device_id === "device-zone-001",
    );
    expect(valve?.zone_id).toBe("zone-a");
  });
});

describe("upsertNodeInRegistry", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    saveRegistry({
      ...CANONICAL_SIM_REGISTRY,
      nodes: [
        {
          node_id: "node-001",
          deployment_id: "dep-001",
          entity_id: "entity-001",
          name: "Original Name",
          status: "pending",
          config_version: 0,
          registered_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("keeps existing name and entity_id when upsert omits them", () => {
    const result = upsertNodeInRegistry({
      node_id: "node-001",
      deployment_id: "dep-001",
      status: "pending",
      config_version: 0,
    });

    const node = result.nodes?.find((n) => n.node_id === "node-001");
    expect(node?.name).toBe("Original Name");
    expect(node?.entity_id).toBe("entity-001");
    expect(node?.registered_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("does not throw on active node and bumps config_version while preserving status", () => {
    const activeNode = {
      node_id: "node-001",
      deployment_id: "dep-001",
      entity_id: "entity-001",
      name: "Active Node",
      status: "active" as const,
      config_version: 3,
    };
    saveRegistry({
      ...CANONICAL_SIM_REGISTRY,
      nodes: [activeNode],
    });

    const result = upsertNodeInRegistry({ ...activeNode, config_version: 9 });

    const node = result.nodes?.find((n) => n.node_id === "node-001");
    expect(node?.config_version).toBe(9);
    expect(node?.status).toBe("active");
  });
});
