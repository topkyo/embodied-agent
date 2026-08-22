import type {
  DeviceRegistry,
  IntentPayload,
  RegistryDevice,
  SceneResolvedDeviceTarget,
} from "@embodied-agent/core";
import { ROBOT_PHYSICAL_SKILLS } from "../skills.js";
import type { M20ClientConfig } from "../m20/client.js";

const ROBOT_CONTROL_SKILLS = new Set<string>(ROBOT_PHYSICAL_SKILLS);

export function isRobotPhysicalControlSkill(intent: IntentPayload): boolean {
  return ROBOT_CONTROL_SKILLS.has(intent.skill);
}

function robotIdFromIntent(intent: IntentPayload): string | undefined {
  return typeof intent.target === "object" && intent.target && "robot_id" in intent.target
    ? (intent.target.robot_id as string | undefined)
    : undefined;
}

export function prepareRobotPhysicalIntent(
  intent: IntentPayload,
  context: { domainConfig?: unknown },
): IntentPayload | { ok: false; reason: string } {
  if (!isRobotPhysicalControlSkill(intent)) return intent;
  const cfg = (context.domainConfig ?? {}) as M20ClientConfig;
  const defaultRobotId = cfg.default_robot_id?.trim();
  const robotId = robotIdFromIntent(intent)?.trim();
  if (!defaultRobotId) {
    return {
      ok: false,
      reason: "robotics 领域缺少 domain_configs.robotics.default_robot_id。",
    };
  }
  if (robotId && robotId !== defaultRobotId) {
    return {
      ok: false,
      reason: `robot_id ${robotId} 不是当前 deployment readiness 覆盖的 default_robot_id。`,
    };
  }
  return {
    ...intent,
    target: {
      ...(typeof intent.target === "object" && intent.target ? intent.target : {}),
      robot_id: defaultRobotId,
    },
  };
}

function findRobotDevice(
  registry: DeviceRegistry,
  deploymentId: string,
  robot_id: string,
): RegistryDevice | undefined {
  return registry.devices.find(
    (d) =>
      d.deployment_id === deploymentId &&
      d.device_id === robot_id &&
      d.device_type === "robot_dog" &&
      d.status === "active" &&
      d.transport === "m20_http",
  );
}

function hasActiveNode(registry: DeviceRegistry, deploymentId: string, nodeId: string): boolean {
  return Boolean(
    registry.nodes?.some(
      (node) =>
        node.deployment_id === deploymentId && node.node_id === nodeId && node.status === "active",
    ),
  );
}

export function resolveRobotDeviceTarget(
  intent: IntentPayload,
  registry: DeviceRegistry,
  context: { deployment_id: string; domainConfig?: unknown },
): { ok: true; target: SceneResolvedDeviceTarget } | { ok: false; reason: string } {
  if (!context.deployment_id.trim()) {
    return { ok: false, reason: "缺少 deployment_id，无法解析机器人目标。" };
  }
  const robotId =
    typeof intent.target === "object" && intent.target && "robot_id" in intent.target
      ? (intent.target.robot_id as string | undefined)
      : undefined;
  const defaultRobotId = ((context.domainConfig ?? {}) as M20ClientConfig).default_robot_id?.trim();
  if (!defaultRobotId) {
    return {
      ok: false,
      reason: "robotics 领域缺少 domain_configs.robotics.default_robot_id。",
    };
  }
  if (robotId && robotId !== defaultRobotId) {
    return {
      ok: false,
      reason: `robot_id ${robotId} 不是当前 deployment readiness 覆盖的 default_robot_id。`,
    };
  }
  const device = findRobotDevice(registry, context.deployment_id, robotId ?? defaultRobotId);
  if (!device) {
    return { ok: false, reason: "未注册 M20 机器狗设备。" };
  }
  if (!device.node_id || !hasActiveNode(registry, device.deployment_id, device.node_id)) {
    return { ok: false, reason: "M20 机器狗未绑定 active Scene Node。" };
  }
  return {
    ok: true,
    target: {
      deployment_id: device.deployment_id,
      node_id: device.node_id,
      transport: device.transport,
      device,
    },
  };
}
