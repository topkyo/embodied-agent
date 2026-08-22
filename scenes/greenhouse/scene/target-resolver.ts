import type {
  DeviceRegistry,
  IntentPayload,
  RegistryDevice,
  SceneResolvedDeviceTarget,
} from "@embodied-agent/core";

export type GreenhouseRegistryDevice = RegistryDevice;

export type GreenhouseResolvedDeviceTarget = SceneResolvedDeviceTarget & {
  greenhouse_id?: string;
};

export type GreenhouseTargetResolution =
  { ok: true; target: GreenhouseResolvedDeviceTarget } | { ok: false; reason: string };

export type GreenhouseTargetResolutionContext = {
  deployment_id: string;
};

export function isGreenhousePhysicalControlSkill(
  intentOrSkill: Pick<IntentPayload, "skill"> | string,
): boolean {
  const skill = typeof intentOrSkill === "string" ? intentOrSkill : intentOrSkill.skill;
  if (
    skill === "greenhouse.open_vent" ||
    skill === "greenhouse.close_vent" ||
    skill === "greenhouse.stop_vent" ||
    skill === "greenhouse.set_mode" ||
    skill === "fan.start" ||
    skill === "fan.stop"
  ) {
    return true;
  }
  return skill === "irrigation.start" || skill === "irrigation.stop";
}

function listVentMotors(
  registry: DeviceRegistry,
  greenhouse_id: string,
  deploymentId: string,
): GreenhouseRegistryDevice[] {
  return registry.devices.filter(
    (d) =>
      d.entity_id === greenhouse_id &&
      d.device_type === "vent_motor" &&
      d.status === "active" &&
      d.deployment_id === deploymentId,
  );
}

function findDeviceById(
  registry: DeviceRegistry,
  device_id: string,
  deploymentId: string,
): GreenhouseRegistryDevice | undefined {
  return registry.devices.find(
    (d) => d.device_id === device_id && d.status === "active" && d.deployment_id === deploymentId,
  );
}

function deploymentIdForGreenhouse(
  registry: DeviceRegistry,
  greenhouse_id: string,
  expectedDeploymentId: string,
): string | undefined {
  const entity = registry.entities.find(
    (e) =>
      e.entity_id === greenhouse_id &&
      e.domain_id === "agriculture" &&
      e.entity_type === "greenhouse" &&
      e.status === "active" &&
      e.deployment_id === expectedDeploymentId,
  );
  return entity?.deployment_id;
}

function resolveVentMotor(
  registry: DeviceRegistry,
  greenhouse_id: string,
  deploymentId: string,
  vent_id?: string,
): GreenhouseRegistryDevice | "ambiguous" | undefined {
  if (vent_id) {
    const byId = findDeviceById(registry, vent_id, deploymentId);
    if (
      byId?.device_type === "vent_motor" &&
      byId.entity_id === greenhouse_id &&
      byId.default_for === "vent_motor"
    ) {
      return byId;
    }
    return undefined;
  }
  const vents = listVentMotors(registry, greenhouse_id, deploymentId);
  if (vents.length === 0) return undefined;
  const defaults = vents.filter((d) => d.default_for === "vent_motor");
  if (defaults.length === 1) return defaults[0];
  return vents.length > 1 ? "ambiguous" : undefined;
}

function findDefaultDevice(
  registry: DeviceRegistry,
  greenhouse_id: string,
  deploymentId: string,
  type: "vent_motor" | "fan" | "greenhouse_controller",
): GreenhouseRegistryDevice | undefined {
  return registry.devices.find(
    (d) =>
      d.entity_id === greenhouse_id &&
      d.deployment_id === deploymentId &&
      d.device_type === type &&
      d.default_for === type &&
      d.status === "active",
  );
}

function configVersionForNode(registry: DeviceRegistry, node_id: string): number | undefined {
  return registry.nodes?.find((n) => n.node_id === node_id)?.config_version;
}

function hasActiveNode(registry: DeviceRegistry, deploymentId: string, nodeId: string): boolean {
  return Boolean(
    registry.nodes?.some(
      (node) =>
        node.deployment_id === deploymentId && node.node_id === nodeId && node.status === "active",
    ),
  );
}

function irrigationZoneMatches(device: GreenhouseRegistryDevice, zone?: string): boolean {
  if (!zone) return true;
  return device.zone_id === zone;
}

export function resolveGreenhouseDeviceTarget(
  intent: IntentPayload,
  registry: DeviceRegistry,
  context: GreenhouseTargetResolutionContext,
): GreenhouseTargetResolution {
  if (!context.deployment_id.trim()) {
    return { ok: false, reason: "缺少 deployment_id，无法解析设备目标。" };
  }
  if (
    intent.skill === "greenhouse.open_vent" ||
    intent.skill === "greenhouse.close_vent" ||
    intent.skill === "greenhouse.stop_vent"
  ) {
    const target = intent.target as { greenhouse_id: string };
    const deploymentId = deploymentIdForGreenhouse(
      registry,
      target.greenhouse_id,
      context.deployment_id,
    );
    if (!deploymentId) {
      return { ok: false, reason: "目标温室未在当前部署注册或未启用。" };
    }
    const parameters = intent.parameters as { vent_id?: string };
    const ventId =
      intent.skill === "greenhouse.stop_vent" ? parameters?.vent_id : parameters.vent_id;
    const resolvedVent = resolveVentMotor(registry, target.greenhouse_id, deploymentId, ventId);
    if (resolvedVent === "ambiguous") {
      const names = listVentMotors(registry, target.greenhouse_id, deploymentId)
        .map((d) => d.name ?? d.device_id)
        .join("、");
      return {
        ok: false,
        reason: `该温室有多台通风设备（${names}），请说明要操作哪一台。`,
      };
    }
    const device = resolvedVent;
    if (!device) {
      return { ok: false, reason: "目标温室未注册默认通风设备。" };
    }
    if (!device.node_id || !hasActiveNode(registry, deploymentId, device.node_id)) {
      return { ok: false, reason: "目标设备未绑定 Scene Node。" };
    }
    return {
      ok: true,
      target: {
        deployment_id: device.deployment_id,
        node_id: device.node_id,
        config_version: configVersionForNode(registry, device.node_id),
        greenhouse_id: target.greenhouse_id,
        device,
      },
    };
  }

  if (intent.skill === "greenhouse.set_mode") {
    const target = intent.target as { greenhouse_id: string };
    const deploymentId = deploymentIdForGreenhouse(
      registry,
      target.greenhouse_id,
      context.deployment_id,
    );
    if (!deploymentId) {
      return { ok: false, reason: "目标温室未在当前部署注册或未启用。" };
    }
    const device = findDefaultDevice(
      registry,
      target.greenhouse_id,
      deploymentId,
      "greenhouse_controller",
    );
    if (!device) {
      return { ok: false, reason: "目标温室未注册环控器。" };
    }
    if (!device.node_id || !hasActiveNode(registry, deploymentId, device.node_id)) {
      return { ok: false, reason: "目标环控器未绑定 Scene Node。" };
    }
    return {
      ok: true,
      target: {
        deployment_id: device.deployment_id,
        node_id: device.node_id,
        config_version: configVersionForNode(registry, device.node_id),
        greenhouse_id: target.greenhouse_id,
        device,
      },
    };
  }

  if (intent.skill === "fan.start" || intent.skill === "fan.stop") {
    const target = intent.target as { fan_id: string };
    const device = findDeviceById(registry, target.fan_id, context.deployment_id);
    if (!device || device.device_type !== "fan") {
      return { ok: false, reason: "目标风机未注册或不可用。" };
    }
    if (
      !device.entity_id ||
      !deploymentIdForGreenhouse(registry, device.entity_id, device.deployment_id)
    ) {
      return { ok: false, reason: "目标风机未绑定当前部署的 active 温室。" };
    }
    if (device.default_for !== "fan") {
      return { ok: false, reason: "目标风机不是当前部署 readiness 覆盖的默认风机。" };
    }
    if (!device.node_id || !hasActiveNode(registry, device.deployment_id, device.node_id)) {
      return { ok: false, reason: "目标风机未绑定 Scene Node。" };
    }
    return {
      ok: true,
      target: {
        deployment_id: device.deployment_id,
        node_id: device.node_id,
        config_version: configVersionForNode(registry, device.node_id),
        greenhouse_id: device.entity_id,
        device,
      },
    };
  }

  if (intent.skill.startsWith("irrigation.")) {
    const zone = (intent.target as { zone_id?: string; greenhouse_id?: string })?.zone_id;
    const ghHint = (intent.target as { greenhouse_id?: string })?.greenhouse_id;
    const deploymentId = ghHint
      ? deploymentIdForGreenhouse(registry, ghHint, context.deployment_id)
      : context.deployment_id;
    if (ghHint && !deploymentId) {
      return { ok: false, reason: `${ghHint} 未在当前部署注册或未启用。` };
    }
    const irrigationDevices = registry.devices.filter((d) => {
      if (d.status !== "active") return false;
      if (d.deployment_id !== deploymentId) return false;
      return (d.device_type as string) === "irrigation_valve" && d.default_for === "irrigation";
    });
    const matches = irrigationDevices.filter((d) => {
      if (ghHint && d.entity_id !== ghHint) return false;
      return irrigationZoneMatches(d, zone);
    });
    let device: GreenhouseRegistryDevice | undefined;
    if (matches.length === 1) {
      device = matches[0];
    } else if (matches.length > 1) {
      const names = matches.map((d) => d.name ?? d.device_id).join("、");
      return {
        ok: false,
        reason: `当前分区匹配多台灌溉设备（${names}），请说明 greenhouse_id 或具体分区。`,
      };
    }
    if (!device && ghHint) {
      device = irrigationDevices.find((d) => d.entity_id === ghHint);
    }
    if (!device) {
      if (ghHint || zone) {
        const label = ghHint ?? zone ?? "目标";
        return { ok: false, reason: `${label} 未注册灌溉设备或分区。` };
      }
      device = irrigationDevices.find((d) => d.default_for === "irrigation");
    }
    if (!device) return { ok: false, reason: "未注册灌溉设备或分区。" };
    if (!device.node_id || !hasActiveNode(registry, device.deployment_id, device.node_id)) {
      return { ok: false, reason: "灌溉设备未绑定 Scene Node。" };
    }
    return {
      ok: true,
      target: {
        deployment_id: device.deployment_id,
        node_id: device.node_id,
        config_version: configVersionForNode(registry, device.node_id),
        greenhouse_id: device.entity_id,
        device,
      },
    };
  }

  return { ok: false, reason: "不支持的物理控制技能或目标无法解析。" };
}
