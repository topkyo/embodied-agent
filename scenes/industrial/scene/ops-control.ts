import type { DeviceRegistry, IntentPayload, OpsControlResolveInput } from "@embodied-agent/core";

function firstActiveEntityId(
  registry: DeviceRegistry,
  deploymentId: string,
  entityType: string,
): string | undefined {
  return registry.entities.find(
    (entity) =>
      entity.deployment_id === deploymentId &&
      entity.status === "active" &&
      entity.entity_type === entityType,
  )?.entity_id;
}

export function resolveIndustrialOpsControlAction(input: OpsControlResolveInput): IntentPayload {
  const { action, deployment_id, domainConfig, registry } = input;
  const cfg = (domainConfig ?? {}) as { default_cabinet_id?: string };
  const cabinetId =
    cfg.default_cabinet_id?.trim() ?? firstActiveEntityId(registry, deployment_id, "cabinet");
  if (!cabinetId) {
    throw new Error("industrial control 缺少 default_cabinet_id 或可用 cabinet 实体。");
  }
  const target = { cabinet_id: cabinetId };
  if (action.skill === "industrial.start_exhaust") {
    const duration = (action.parameters as { duration_seconds?: number } | undefined)
      ?.duration_seconds;
    if (duration == null) {
      throw new Error("ops-control 启动排风缺少 duration_seconds 参数");
    }
    return {
      skill: action.skill,
      target,
      parameters: { duration_seconds: duration },
      confidence: 0.95,
    };
  }
  return {
    skill: action.skill,
    target,
    parameters: {},
    confidence: 0.95,
  };
}
