import type {
  DeviceRegistry,
  DomainPackReadinessIssue,
  DomainPackRuntimeFlywheelReadiness,
  DomainPackRuntimeFlywheelReadinessContext,
} from "@embodied-agent/core";

export type AgricultureDomainConfig = {
  flywheel_greenhouse_ids?: string[];
};

export function parseFlywheelGreenhouseIds(domainConfig: unknown): string[] {
  const cfg = (domainConfig ?? {}) as AgricultureDomainConfig;
  return [...new Set((cfg.flywheel_greenhouse_ids ?? []).map((id) => id.trim()).filter(Boolean))];
}

export function validateGreenhouseConfig(domainConfig: unknown): DomainPackReadinessIssue[] {
  const greenhouseIds = parseFlywheelGreenhouseIds(domainConfig);
  if (greenhouseIds.length === 0) {
    return [
      {
        code: "flywheel_greenhouse_ids_missing",
        message: "agriculture 交付缺少 domain_configs.agriculture.flywheel_greenhouse_ids。",
        severity: "error",
      },
    ];
  }
  return [];
}

export function resolveFlywheelNodes(
  registry: DeviceRegistry,
  deploymentId: string,
  greenhouseIds: readonly string[],
): string[] {
  const nodeIds = new Set<string>();
  for (const greenhouseId of greenhouseIds) {
    for (const device of registry.devices) {
      if (
        device.deployment_id === deploymentId &&
        device.entity_id === greenhouseId &&
        device.status === "active" &&
        device.node_id
      ) {
        nodeIds.add(device.node_id);
      }
    }
  }
  return [...nodeIds].sort();
}

export function resolveGreenhouseFlywheelReadiness(
  registry: DeviceRegistry,
  deploymentId: string,
  domainConfig: unknown,
): DomainPackRuntimeFlywheelReadiness {
  const greenhouseIds = parseFlywheelGreenhouseIds(domainConfig);
  if (greenhouseIds.length === 0) {
    // 缺配置必须失败可见：不允许空 requiredTelemetry/probe 把飞轮判成 ready。
    return {
      requiredTelemetry: [],
      requiredNodes: [],
      probe: () => [
        {
          id: "flywheel_greenhouse_ids_missing",
          ok: false,
          label: "Greenhouse Flywheel Config",
          detail:
            "domain_configs.agriculture.flywheel_greenhouse_ids 未配置，飞轮 readiness 无法评估。",
          severity: "error" as const,
        },
      ],
    };
  }
  return {
    requiredTelemetry: greenhouseIds.map((entity_id) => ({
      entity_id,
      metric: "temperature_c",
    })),
    requiredNodes: resolveFlywheelNodes(registry, deploymentId, greenhouseIds),
    probe: ({ services }: DomainPackRuntimeFlywheelReadinessContext) => {
      const ready = greenhouseIds.every((entityId) => services.isSustainedAlertReady(entityId));
      return [
        {
          id: "greenhouse_sustained_alerts",
          ok: ready,
          label: "Greenhouse Sustained Alerts",
          detail: ready
            ? `${greenhouseIds.length} 棚 sustained alert 可评估`
            : "configured greenhouses sustained alert 状态尚未满足飞轮检查",
          severity: "error" as const,
        },
      ];
    },
  };
}
