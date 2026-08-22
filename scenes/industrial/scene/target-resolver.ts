import type {
  DeviceRegistry,
  IntentPayload,
  RegistryDevice,
  SceneResolvedDeviceTarget,
} from "@embodied-agent/core";

export type IndustrialTargetResolution =
  { ok: true; target: SceneResolvedDeviceTarget } | { ok: false; reason: string };

export function isIndustrialPhysicalControlSkill(
  intentOrSkill: Pick<IntentPayload, "skill"> | string,
): boolean {
  const skill = typeof intentOrSkill === "string" ? intentOrSkill : intentOrSkill.skill;
  return skill === "industrial.start_exhaust" || skill === "industrial.stop_exhaust";
}

function configDefaultCabinet(domainConfig: unknown): string | undefined {
  const value = (domainConfig ?? {}) as { default_cabinet_id?: string };
  return value.default_cabinet_id?.trim() || undefined;
}

function targetCabinetId(intent: IntentPayload, domainConfig: unknown): string | undefined {
  const target = intent.target as { cabinet_id?: string };
  return target.cabinet_id?.trim() || configDefaultCabinet(domainConfig);
}

function hasActiveNode(registry: DeviceRegistry, deploymentId: string, nodeId: string): boolean {
  return Boolean(
    registry.nodes?.some(
      (node) =>
        node.deployment_id === deploymentId && node.node_id === nodeId && node.status === "active",
    ),
  );
}

function configVersionForNode(registry: DeviceRegistry, nodeId: string): number | undefined {
  return registry.nodes?.find((node) => node.node_id === nodeId)?.config_version;
}

function findCabinetFan(
  registry: DeviceRegistry,
  deploymentId: string,
  cabinetId: string,
): RegistryDevice | undefined {
  return registry.devices.find(
    (device) =>
      device.deployment_id === deploymentId &&
      device.entity_id === cabinetId &&
      device.device_type === "fan" &&
      device.default_for === "exhaust_fan" &&
      device.status === "active",
  );
}

export function resolveIndustrialDeviceTarget(
  intent: IntentPayload,
  registry: DeviceRegistry,
  context: { deployment_id: string; domainConfig?: unknown },
): IndustrialTargetResolution {
  if (!context.deployment_id.trim()) {
    return { ok: false, reason: "缺少 deployment_id，无法解析工业设备目标。" };
  }
  const cabinetId = targetCabinetId(intent, context.domainConfig);
  if (!cabinetId) {
    return {
      ok: false,
      reason: "未配置默认配电柜，请显式配置 domain_configs.industrial.default_cabinet_id。",
    };
  }
  const cabinet = registry.entities.find(
    (entity) =>
      entity.deployment_id === context.deployment_id &&
      entity.domain_id === "industrial" &&
      entity.entity_type === "cabinet" &&
      entity.entity_id === cabinetId &&
      entity.status === "active",
  );
  if (!cabinet) {
    return { ok: false, reason: `配电柜 ${cabinetId} 未在当前部署注册或未启用。` };
  }
  const fan = findCabinetFan(registry, context.deployment_id, cabinetId);
  if (!fan) {
    return { ok: false, reason: `配电柜 ${cabinetId} 未注册 active 默认排风设备。` };
  }
  if (!fan.node_id || !hasActiveNode(registry, context.deployment_id, fan.node_id)) {
    return { ok: false, reason: `排风设备 ${fan.device_id} 未绑定 active Scene Node。` };
  }
  return {
    ok: true,
    target: {
      deployment_id: fan.deployment_id,
      node_id: fan.node_id,
      config_version: configVersionForNode(registry, fan.node_id),
      device: fan,
    },
  };
}
