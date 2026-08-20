import { describe, expect, it } from "vitest";
import type { DeviceRegistry, RegistryDevice } from "./registry.js";
import type { Deployment, RegistryEntity, Node } from "./schemas/device.js";

describe("DeviceRegistry type contract", () => {
  function makeDeployment(): Deployment {
    return {
      deployment_id: "dep-001",
      name: "Greenhouse Alpha",
      timezone: "Asia/Shanghai",
      status: "active",
    };
  }

  function makeEntity(): RegistryEntity {
    return {
      entity_id: "entity-001",
      entity_type: "greenhouse",
      domain_id: "agriculture",
      deployment_id: "dep-001",
      name: "Greenhouse 1",
      aliases: ["gh1"],
      status: "active",
    };
  }

  function makeDevice(): RegistryDevice {
    return {
      device_id: "device-001",
      deployment_id: "dep-001",
      entity_id: "entity-001",
      device_type: "vent",
      name: "Vent 1",
      aliases: ["v1"],
      node_id: "node-001",
      status: "active",
    };
  }

  function makeNode(): Node {
    return {
      node_id: "node-001",
      deployment_id: "dep-001",
      status: "active",
    };
  }

  it("builds a minimal DeviceRegistry with required fields", () => {
    const registry: DeviceRegistry = {
      deployments: [makeDeployment()],
      entities: [makeEntity()],
      devices: [makeDevice()],
    };
    expect(registry.deployments).toHaveLength(1);
    expect(registry.entities).toHaveLength(1);
    expect(registry.devices).toHaveLength(1);
    expect(registry.nodes).toBeUndefined();
  });

  it("builds a DeviceRegistry with optional nodes", () => {
    const registry: DeviceRegistry = {
      deployments: [makeDeployment()],
      entities: [makeEntity()],
      nodes: [makeNode()],
      devices: [makeDevice()],
    };
    expect(registry.nodes).toHaveLength(1);
    expect(registry.nodes?.[0].node_id).toBe("node-001");
  });

  it("RegistryDevice extends Device with optional domain-specific fields", () => {
    const device: RegistryDevice = {
      ...makeDevice(),
      default_for: "ventilation",
      max_duration_seconds: 600,
      confirm_duration_threshold_seconds: 300,
      manual_override: false,
      channel: "relay-1",
      metrics: ["temperature_c", "humidity_percent"],
      zone_id: "zone-001",
    };
    expect(device.default_for).toBe("ventilation");
    expect(device.max_duration_seconds).toBe(600);
    expect(device.confirm_duration_threshold_seconds).toBe(300);
    expect(device.manual_override).toBe(false);
    expect(device.channel).toBe("relay-1");
    expect(device.metrics).toEqual(["temperature_c", "humidity_percent"]);
    expect(device.zone_id).toBe("zone-001");
  });

  it("RegistryDevice works without any optional fields", () => {
    const device: RegistryDevice = makeDevice();
    expect(device.default_for).toBeUndefined();
    expect(device.max_duration_seconds).toBeUndefined();
    expect(device.confirm_duration_threshold_seconds).toBeUndefined();
    expect(device.manual_override).toBeUndefined();
    expect(device.channel).toBeUndefined();
    expect(device.metrics).toBeUndefined();
    expect(device.zone_id).toBeUndefined();
  });

  it("DeviceRegistry accepts empty arrays", () => {
    const registry: DeviceRegistry = {
      deployments: [],
      entities: [],
      devices: [],
    };
    expect(registry.deployments).toEqual([]);
    expect(registry.entities).toEqual([]);
    expect(registry.devices).toEqual([]);
  });

  it("DeviceRegistry accepts multiple entries", () => {
    const registry: DeviceRegistry = {
      deployments: [
        makeDeployment(),
        {
          ...makeDeployment(),
          deployment_id: "dep-002",
          name: "Greenhouse Beta",
        },
      ],
      entities: [
        makeEntity(),
        {
          ...makeEntity(),
          entity_id: "entity-002",
          name: "Greenhouse 2",
        },
      ],
      nodes: [
        makeNode(),
        {
          ...makeNode(),
          node_id: "node-002",
        },
      ],
      devices: [
        makeDevice(),
        {
          ...makeDevice(),
          device_id: "device-002",
          device_type: "fan",
          name: "Fan 1",
        },
      ],
    };
    expect(registry.deployments).toHaveLength(2);
    expect(registry.entities).toHaveLength(2);
    expect(registry.nodes).toHaveLength(2);
    expect(registry.devices).toHaveLength(2);
    expect(registry.devices[1].device_type).toBe("fan");
  });
});
