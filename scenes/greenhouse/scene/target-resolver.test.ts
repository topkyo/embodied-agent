import { describe, expect, it } from "vitest";
import type { IntentPayload } from "@embodied-agent/core";
import { buildCanonicalSimRegistry } from "../registry/canonical-sim.js";
import type { DeviceRegistry } from "../registry/device-registry.js";
import { resolveGreenhouseDeviceTarget } from "./target-resolver.js";

const ambiguousRegistry: DeviceRegistry = {
  deployments: [
    {
      deployment_id: "dep-gh-pilot-001",
      name: "Test",
      timezone: "UTC",
      status: "active",
    },
  ],
  entities: [
    {
      deployment_id: "dep-gh-pilot-001",
      domain_id: "agriculture",
      entity_type: "greenhouse",
      entity_id: "gh-001",
      name: "1号棚",
      aliases: ["1号棚"],
      status: "active",
    },
  ],
  devices: [
    {
      device_id: "vent-left",
      deployment_id: "dep-gh-pilot-001",
      entity_id: "gh-001",
      device_type: "vent_motor",
      name: "左侧帘",
      aliases: [],
      node_id: "node-1",
      status: "active",
    },
    {
      device_id: "vent-right",
      deployment_id: "dep-gh-pilot-001",
      entity_id: "gh-001",
      device_type: "vent_motor",
      name: "右侧帘",
      aliases: [],
      node_id: "node-1",
      status: "active",
    },
  ],
};

describe("resolveGreenhouseDeviceTarget", () => {
  it("fails visibly without deployment context", () => {
    const result = resolveGreenhouseDeviceTarget(
      {
        skill: "greenhouse.set_mode",
        target: { greenhouse_id: "gh-001" },
        parameters: { mode: "night_vent", max_temp_c: 30 },
      },
      buildCanonicalSimRegistry(),
      { deployment_id: "" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("deployment_id");
    }
  });

  it("resolves gh-001 set_mode to canonical controller id gh-001", () => {
    const intent: IntentPayload = {
      skill: "greenhouse.set_mode",
      target: { greenhouse_id: "gh-001" },
      parameters: { mode: "night_vent", max_temp_c: 30 },
    };
    const result = resolveGreenhouseDeviceTarget(intent, buildCanonicalSimRegistry(), {
      deployment_id: "dep-gh-pilot-001",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.device.device_id).toBe("gh-001");
      expect(result.target.node_id).toBe("node-sim-gh-001");
    }
  });

  it("resolves gh-002 set_mode to ghc-sim-gh-002", () => {
    const intent: IntentPayload = {
      skill: "greenhouse.set_mode",
      target: { greenhouse_id: "gh-002" },
      parameters: { mode: "night_vent", max_temp_c: 30 },
    };
    const result = resolveGreenhouseDeviceTarget(intent, buildCanonicalSimRegistry(), {
      deployment_id: "dep-gh-pilot-001",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.device.device_id).toBe("ghc-sim-gh-002");
      expect(result.target.node_id).toBe("node-sim-gh-002");
    }
  });

  it("returns clarification reason when multiple vents have no default", () => {
    const intent: IntentPayload = {
      skill: "greenhouse.open_vent",
      target: { greenhouse_id: "gh-001" },
      parameters: { duration_seconds: 300 },
    };
    const result = resolveGreenhouseDeviceTarget(intent, ambiguousRegistry, {
      deployment_id: "dep-gh-pilot-001",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("多台通风设备");
    }
  });

  it("resolves zone-b to gh-002 irrigation valve", () => {
    const intent: IntentPayload = {
      skill: "irrigation.start",
      target: { zone_id: "zone-b", greenhouse_id: "gh-002" },
      parameters: { duration_seconds: 900 },
    };
    const result = resolveGreenhouseDeviceTarget(intent, buildCanonicalSimRegistry(), {
      deployment_id: "dep-gh-pilot-001",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.device.device_id).toBe("irrigation-sim-gh-002");
      expect(result.target.greenhouse_id).toBe("gh-002");
    }
  });

  it("fails visibly when gh-002 irrigation device is missing", () => {
    const registry = buildCanonicalSimRegistry();
    const intent: IntentPayload = {
      skill: "irrigation.start",
      target: { zone_id: "zone-b", greenhouse_id: "gh-002" },
      parameters: { duration_seconds: 900 },
    };
    const result = resolveGreenhouseDeviceTarget(
      intent,
      {
        ...registry,
        devices: registry.devices.filter((d) => d.entity_id === "gh-001"),
      },
      { deployment_id: "dep-gh-pilot-001" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("gh-002");
    }
  });

  it("blocks greenhouse targets outside the current deployment", () => {
    const registry = buildCanonicalSimRegistry();
    const intent: IntentPayload = {
      skill: "greenhouse.set_mode",
      target: { greenhouse_id: "gh-001" },
      parameters: { mode: "night_vent", max_temp_c: 30 },
    };
    const result = resolveGreenhouseDeviceTarget(intent, registry, {
      deployment_id: "dep-other",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("当前部署");
    }
  });

  it("does not resolve disabled greenhouse devices", () => {
    const registry = buildCanonicalSimRegistry();
    const intent: IntentPayload = {
      skill: "greenhouse.open_vent",
      target: { greenhouse_id: "gh-001" },
      parameters: { duration_seconds: 300 },
    };
    const result = resolveGreenhouseDeviceTarget(
      intent,
      {
        ...registry,
        devices: registry.devices.map((device) =>
          device.device_id === "vent-sim-gh-001"
            ? { ...device, status: "disabled" as const }
            : device,
        ),
      },
      { deployment_id: "dep-gh-pilot-001" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("通风设备");
    }
  });

  it("does not resolve a single non-default vent outside readiness coverage", () => {
    const registry = buildCanonicalSimRegistry();
    const intent: IntentPayload = {
      skill: "greenhouse.open_vent",
      target: { greenhouse_id: "gh-001" },
      parameters: { duration_seconds: 300 },
    };
    const result = resolveGreenhouseDeviceTarget(
      intent,
      {
        ...registry,
        devices: registry.devices.map((device) =>
          device.device_id === "vent-sim-gh-001" ? { ...device, default_for: undefined } : device,
        ),
      },
      { deployment_id: "dep-gh-pilot-001" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("通风设备");
    }
  });

  it("blocks explicit fan ids from another deployment", () => {
    const registry = buildCanonicalSimRegistry();
    const intent: IntentPayload = {
      skill: "fan.start",
      target: { fan_id: "fan-foreign" },
      parameters: { duration_seconds: 300 },
    };
    const result = resolveGreenhouseDeviceTarget(
      intent,
      {
        ...registry,
        deployments: [
          ...registry.deployments,
          {
            deployment_id: "dep-other",
            name: "Other",
            timezone: "UTC",
            status: "active",
          },
        ],
        entities: [
          ...registry.entities,
          {
            deployment_id: "dep-other",
            domain_id: "agriculture",
            entity_type: "greenhouse",
            entity_id: "gh-other",
            name: "Other Greenhouse",
            aliases: [],
            status: "active",
          },
        ],
        devices: [
          ...registry.devices,
          {
            device_id: "fan-foreign",
            deployment_id: "dep-other",
            entity_id: "gh-other",
            device_type: "fan",
            name: "Other Fan",
            aliases: [],
            node_id: "node-other",
            status: "active",
            default_for: "fan",
          },
        ],
      },
      { deployment_id: "dep-gh-pilot-001" },
    );
    expect(result.ok).toBe(false);
  });

  it("blocks explicit default fan without active greenhouse binding", () => {
    const registry = buildCanonicalSimRegistry();
    const intent: IntentPayload = {
      skill: "fan.start",
      target: { fan_id: "fan-orphan" },
      parameters: { duration_seconds: 300 },
    };
    const result = resolveGreenhouseDeviceTarget(
      intent,
      {
        ...registry,
        devices: [
          ...registry.devices,
          {
            device_id: "fan-orphan",
            deployment_id: "dep-gh-pilot-001",
            device_type: "fan",
            name: "Orphan Fan",
            aliases: [],
            node_id: "node-sim-gh-001",
            status: "active",
            default_for: "fan",
          },
        ],
      },
      { deployment_id: "dep-gh-pilot-001" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("active 温室");
    }
  });

  it("resolves irrigation zone from registry instead of fixed greenhouse ids", () => {
    const intent: IntentPayload = {
      skill: "irrigation.start",
      target: { zone_id: "zone-a" },
      parameters: { duration_seconds: 300 },
    };
    const result = resolveGreenhouseDeviceTarget(
      intent,
      {
        deployments: [
          {
            deployment_id: "dep-custom",
            name: "Custom",
            timezone: "UTC",
            status: "active",
          },
        ],
        entities: [
          {
            deployment_id: "dep-custom",
            domain_id: "agriculture",
            entity_type: "greenhouse",
            entity_id: "gh-custom",
            name: "Custom Greenhouse",
            aliases: [],
            status: "active",
          },
        ],
        nodes: [
          {
            node_id: "node-custom",
            deployment_id: "dep-custom",
            entity_id: "gh-custom",
            status: "active",
          },
        ],
        devices: [
          {
            device_id: "irrigation-custom-a",
            deployment_id: "dep-custom",
            entity_id: "gh-custom",
            device_type: "irrigation_valve",
            name: "Custom A Zone",
            aliases: [],
            node_id: "node-custom",
            status: "active",
            zone_id: "zone-a",
            default_for: "irrigation",
          },
        ],
      },
      { deployment_id: "dep-custom" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.greenhouse_id).toBe("gh-custom");
      expect(result.target.device.device_id).toBe("irrigation-custom-a");
    }
  });

  it("blocks explicit non-default controllable devices outside readiness coverage", () => {
    const registry = buildCanonicalSimRegistry();
    const withExtras: DeviceRegistry = {
      ...registry,
      devices: [
        ...registry.devices,
        {
          device_id: "vent-extra",
          deployment_id: "dep-gh-pilot-001",
          entity_id: "gh-001",
          device_type: "vent_motor",
          name: "Extra Vent",
          aliases: [],
          node_id: "node-sim-gh-001",
          status: "active",
        },
        {
          device_id: "fan-extra",
          deployment_id: "dep-gh-pilot-001",
          entity_id: "gh-001",
          device_type: "fan",
          name: "Extra Fan",
          aliases: [],
          node_id: "node-sim-gh-001",
          status: "active",
        },
        {
          device_id: "irrigation-extra",
          deployment_id: "dep-gh-pilot-001",
          entity_id: "gh-001",
          device_type: "irrigation_valve",
          name: "Extra Irrigation",
          aliases: [],
          node_id: "node-sim-gh-001",
          status: "active",
          zone_id: "zone-extra",
        },
      ],
    };

    const vent = resolveGreenhouseDeviceTarget(
      {
        skill: "greenhouse.open_vent",
        target: { greenhouse_id: "gh-001" },
        parameters: { vent_id: "vent-extra", duration_seconds: 300 },
      },
      withExtras,
      { deployment_id: "dep-gh-pilot-001" },
    );
    const fan = resolveGreenhouseDeviceTarget(
      {
        skill: "fan.start",
        target: { fan_id: "fan-extra" },
        parameters: { duration_seconds: 300 },
      },
      withExtras,
      { deployment_id: "dep-gh-pilot-001" },
    );
    const irrigation = resolveGreenhouseDeviceTarget(
      {
        skill: "irrigation.start",
        target: { zone_id: "zone-extra" },
        parameters: { duration_seconds: 300 },
      },
      withExtras,
      { deployment_id: "dep-gh-pilot-001" },
    );

    expect(vent.ok).toBe(false);
    expect(fan.ok).toBe(false);
    expect(irrigation.ok).toBe(false);
  });
});
