import type { DeviceRegistry, IntentPayload, OpsControlResolveInput } from "@embodied-agent/core";

function firstActiveRobotId(
  registry: DeviceRegistry,
  deploymentId: string,
  domainConfig: unknown,
): string | undefined {
  const cfg = (domainConfig ?? {}) as { default_robot_id?: string };
  const configured = cfg.default_robot_id?.trim();
  if (configured) return configured;
  return registry.devices.find(
    (device) =>
      device.deployment_id === deploymentId &&
      device.device_type === "robot_dog" &&
      device.status === "active",
  )?.device_id;
}

export function resolveRoboticsOpsControlAction(input: OpsControlResolveInput): IntentPayload {
  const { action, deployment_id, domainConfig, registry } = input;
  const robotId = firstActiveRobotId(registry, deployment_id, domainConfig);
  if (!robotId) {
    throw new Error("robotics control 缺少 default_robot_id 或可用 robot_dog 设备。");
  }
  return {
    skill: action.skill,
    target: { robot_id: robotId },
    parameters: action.parameters ?? {},
    confidence: 0.95,
  };
}
