import { describe, expect, it } from "vitest";
import type { DeviceRegistry } from "@embodied-agent/node";
import { nodeNeedsBinding, shouldRebindNode } from "./sim-dual-nodes.js";

const base: DeviceRegistry = {
  deployments: [
    { deployment_id: "dep-gh-pilot-001", name: "x", timezone: "Asia/Shanghai", status: "active" },
  ],
  entities: [],
  nodes: [
    {
      node_id: "node-sim-gh-002",
      deployment_id: "dep-gh-pilot-001",
      entity_id: "gh-002",
      status: "active",
      config_version: 1,
    },
  ],
  devices: [],
};

describe("nodeNeedsBinding", () => {
  it("true when node active but no devices", () => {
    expect(nodeNeedsBinding(base, "node-sim-gh-002")).toBe(true);
  });

  it("false when devices bound", () => {
    const reg: DeviceRegistry = {
      ...base,
      devices: [
        {
          device_id: "vent-sim-gh-002",
          deployment_id: "dep-gh-pilot-001",
          entity_id: "gh-002",
          device_type: "vent_motor",
          name: "v",
          node_id: "node-sim-gh-002",
          status: "active",
        },
      ],
    };
    expect(nodeNeedsBinding(reg, "node-sim-gh-002")).toBe(false);
  });

  it("true when node missing", () => {
    expect(nodeNeedsBinding({ ...base, nodes: [] }, "node-sim-gh-002")).toBe(true);
  });
});

describe("shouldRebindNode", () => {
  const bound: DeviceRegistry = {
    ...base,
    devices: [
      {
        device_id: "vent-sim-gh-002",
        deployment_id: "dep-gh-pilot-001",
        entity_id: "gh-002",
        device_type: "vent_motor",
        name: "v",
        node_id: "node-sim-gh-002",
        status: "active",
      },
    ],
  };

  it("false when bound and not forced", () => {
    expect(shouldRebindNode(bound, "node-sim-gh-002", false)).toBe(false);
  });

  it("true when forced even if bound", () => {
    expect(shouldRebindNode(bound, "node-sim-gh-002", true)).toBe(true);
  });

  it("true when unbound and not forced", () => {
    expect(shouldRebindNode(base, "node-sim-gh-002", false)).toBe(true);
  });
});
