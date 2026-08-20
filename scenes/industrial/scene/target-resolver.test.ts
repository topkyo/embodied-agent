import { describe, expect, it } from "vitest";
import type { DeviceRegistry, IntentPayload } from "@embodied-agent/core";
import { resolveIndustrialDeviceTarget } from "./target-resolver.js";

const registry: DeviceRegistry = {
  deployments: [
    {
      deployment_id: "dep-industrial-001",
      name: "工业",
      timezone: "Asia/Shanghai",
      status: "active",
    },
  ],
  entities: [
    {
      entity_id: "cabinet-001",
      deployment_id: "dep-industrial-001",
      domain_id: "industrial",
      entity_type: "cabinet",
      name: "配电柜",
      aliases: [],
      status: "active",
    },
  ],
  nodes: [
    {
      node_id: "node-industrial-001",
      deployment_id: "dep-industrial-001",
      name: "节点",
      status: "active",
    },
  ],
  devices: [
    {
      device_id: "fan-001",
      deployment_id: "dep-industrial-001",
      entity_id: "cabinet-001",
      device_type: "fan",
      name: "排风",
      aliases: [],
      node_id: "node-industrial-001",
      status: "active",
      default_for: "exhaust_fan",
    },
  ],
};

const intent: IntentPayload = {
  skill: "industrial.start_exhaust",
  target: {},
  parameters: { duration_seconds: 600 },
};

describe("resolveIndustrialDeviceTarget", () => {
  it("resolves against the default cabinet", () => {
    const result = resolveIndustrialDeviceTarget(intent, registry, {
      deployment_id: "dep-industrial-001",
      domainConfig: { default_cabinet_id: "cabinet-001" },
    });
    expect(result.ok).toBe(true);
  });

  it("fails when default_cabinet_id missing", () => {
    const result = resolveIndustrialDeviceTarget(intent, registry, {
      deployment_id: "dep-industrial-001",
      domainConfig: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("未配置默认配电柜");
  });

  it("fails when cabinet not found", () => {
    const result = resolveIndustrialDeviceTarget(intent, registry, {
      deployment_id: "dep-industrial-001",
      domainConfig: { default_cabinet_id: "cabinet-999" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("未在当前部署注册");
  });

  it("fails when fan missing", () => {
    const result = resolveIndustrialDeviceTarget(
      intent,
      { ...registry, devices: [] },
      { deployment_id: "dep-industrial-001", domainConfig: { default_cabinet_id: "cabinet-001" } },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("未注册 active 默认排风设备");
  });

  it("fails when deployment_id missing", () => {
    const result = resolveIndustrialDeviceTarget(intent, registry, {
      deployment_id: "",
      domainConfig: { default_cabinet_id: "cabinet-001" },
    });
    expect(result.ok).toBe(false);
  });
});
