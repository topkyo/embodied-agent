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

export function resolveAgricultureOpsControlAction(input: OpsControlResolveInput): IntentPayload {
  const { action, deployment_id, registry } = input;
  const duration = (action.parameters as { duration_seconds?: number } | undefined)
    ?.duration_seconds;
  const modeParams = action.parameters as
    | { max_temp_c?: number; temp_low_c?: number; temp_high_c?: number; until_iso?: string }
    | undefined;
  const greenhouseId = firstActiveEntityId(registry, deployment_id, "greenhouse");
  if (!greenhouseId) {
    throw new Error("agriculture control 缺少可用 greenhouse 实体。");
  }
  const target = { greenhouse_id: greenhouseId };
  if (action.skill === "irrigation.start") {
    if (duration == null) {
      throw new Error("ops-control 启动灌溉缺少 duration_seconds 参数");
    }
    return {
      skill: action.skill,
      target: { ...target, zone_id: "zone-a" },
      parameters: { duration_seconds: duration },
      confidence: 0.95,
    };
  }
  if (action.skill === "greenhouse.set_mode") {
    const maxTempC = modeParams?.max_temp_c;
    const tempLowC = modeParams?.temp_low_c;
    if (maxTempC == null || tempLowC == null) {
      throw new Error("ops-control 设置模式缺少 max_temp_c 或 temp_low_c 参数");
    }
    return {
      skill: action.skill,
      target,
      parameters: {
        mode: "night_vent",
        max_temp_c: maxTempC,
        temp_low_c: tempLowC,
        temp_high_c: modeParams?.temp_high_c,
        until_iso: modeParams?.until_iso,
      },
      confidence: 0.95,
    };
  }
  return {
    skill: action.skill,
    target,
    parameters: duration == null ? {} : { duration_seconds: duration },
    confidence: 0.95,
  };
}
