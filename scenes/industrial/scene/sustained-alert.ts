import type {
  DomainPackProactiveAlerts,
  DomainPackSustainedAlertInput,
  DomainPackSustainedAlertL2Plan,
  IntentPayload,
  RegistryDevice,
} from "@embodied-agent/core";

const SUGGESTED_EXHAUST_SECONDS = 600;

type IndustrialSustainedDevice = Pick<RegistryDevice, "device_id" | "entity_id" | "device_type">;

function isUpperBoundBreach(operator: string): boolean {
  return operator === ">" || operator === ">=";
}

function resolveFanIdForCabinet(
  cabinetId: string,
  devices: readonly IndustrialSustainedDevice[],
): string | undefined {
  return devices.find((d) => d.entity_id === cabinetId && d.device_type === "fan")?.device_id;
}

function startExhaustIntent(cabinetId: string, fanId: string | undefined): IntentPayload {
  return {
    skill: "industrial.start_exhaust",
    target: fanId ? { cabinet_id: cabinetId, fan_id: fanId } : { cabinet_id: cabinetId },
    parameters: { duration_seconds: SUGGESTED_EXHAUST_SECONDS },
    confidence: 0.9,
  };
}

export function buildIndustrialSustainedL1Message(input: DomainPackSustainedAlertInput): string {
  return (
    `【持续异常】${input.entityId} 柜内温度已连续 ${input.streakMinutes} 分钟${input.operator}${input.threshold}°C（当前 ${input.current}°C）。` +
    "建议检查排风设备运行状态。"
  );
}

export function buildIndustrialSustainedL2Plan(
  input: DomainPackSustainedAlertInput,
): DomainPackSustainedAlertL2Plan | null {
  if (!isUpperBoundBreach(input.operator)) return null;
  if (input.metric !== "temperature_c") return null;
  const fanId = resolveFanIdForCabinet(input.entityId, input.devices);
  return {
    cooldownKeyPrefix: "industrial-sustained-l2",
    templateText:
      `【过温排风】${input.entityId} 柜内温度已连续 ${input.streakMinutes} 分钟偏高（当前 ${input.current}°C）。` +
      `建议启动排风 ${SUGGESTED_EXHAUST_SECONDS / 60} 分钟降温。请回复「确认」执行，或「取消」忽略。`,
    summaryData: {
      cabinet_id: input.entityId,
      temperature_c: input.current,
      streak_minutes: input.streakMinutes,
    },
    confirmIntent: startExhaustIntent(input.entityId, fanId),
    sceneSkillId: "industrial_overheat_exhaust",
  };
}

export const INDUSTRIAL_PROACTIVE_ALERTS: DomainPackProactiveAlerts = {
  sustainedL1Message: buildIndustrialSustainedL1Message,
  sustainedL2Plan: buildIndustrialSustainedL2Plan,
};
