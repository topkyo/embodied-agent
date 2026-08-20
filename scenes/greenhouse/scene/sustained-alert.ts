import type {
  DomainPackProactiveAlerts,
  DomainPackSustainedAlertInput,
  IntentPayload,
} from "@embodied-agent/core";
import { resolveSceneForTrigger } from "./registry.js";
import {
  formatGreenhouseMetricLabel,
  formatGreenhouseMetricValue,
  type GreenhouseMetric,
} from "./labels.js";

const HIGH_TEMP_FAN_C = 35;
const SUGGESTED_PULSE_SECONDS = 600;

export type GreenhouseSustainedOperator = ">" | ">=" | "<" | "<=" | string;

export type GreenhouseSustainedRegistryDevice = {
  device_id: string;
  entity_id?: string;
  device_type?: string;
};

export type GreenhouseSustainedL1Input = {
  greenhouseId: string;
  metric: GreenhouseMetric;
  streakMinutes: number;
  current: number;
  threshold: number;
  operator: GreenhouseSustainedOperator;
};

export type GreenhouseSustainedL2Input = {
  greenhouseId: string;
  metric: GreenhouseMetric;
  operator: GreenhouseSustainedOperator;
  threshold: number;
  current: number;
  streakMinutes: number;
  devices: readonly GreenhouseSustainedRegistryDevice[];
};

export type GreenhouseSustainedL2Plan = {
  cooldownKeyPrefix: string;
  templateText: string;
  summaryData: Record<string, unknown>;
  confirmIntent: IntentPayload;
  sceneSkillId?: string;
};

function toGreenhouseMetric(metric: string): GreenhouseMetric {
  if (metric === "temperature_c" || metric === "humidity_percent") return metric;
  throw new Error(`unsupported greenhouse sustained alert metric: ${metric}`);
}

function isUpperBoundBreach(operator: GreenhouseSustainedOperator): boolean {
  return operator === ">" || operator === ">=";
}

function pulseVentIntent(greenhouseId: string): IntentPayload {
  return {
    skill: "greenhouse.open_vent",
    target: { greenhouse_id: greenhouseId },
    parameters: { duration_seconds: SUGGESTED_PULSE_SECONDS },
    confidence: 0.9,
  };
}

function highTempFanIntent(greenhouseId: string, fanId: string): IntentPayload {
  return {
    skill: "fan.start",
    target: { greenhouse_id: greenhouseId, fan_id: fanId },
    parameters: { duration_seconds: SUGGESTED_PULSE_SECONDS },
    confidence: 0.9,
  };
}

function nightVentIntent(greenhouseId: string, maxTemp: number): IntentPayload {
  return {
    skill: "greenhouse.set_mode",
    target: { greenhouse_id: greenhouseId },
    parameters: {
      mode: "night_vent",
      max_temp_c: maxTemp,
      temp_low_c: Math.max(maxTemp - 2, 0),
    },
    confidence: 0.95,
  };
}

function resolveFanIdForGreenhouse(
  greenhouseId: string,
  devices: readonly GreenhouseSustainedRegistryDevice[],
): string | undefined {
  return devices.find((d) => d.entity_id === greenhouseId && d.device_type === "fan")?.device_id;
}

export function buildGreenhouseSustainedL1Message(input: GreenhouseSustainedL1Input): string {
  const label = formatGreenhouseMetricLabel(input.metric);
  const current = formatGreenhouseMetricValue(input.metric, input.current);
  const threshold = formatGreenhouseMetricValue(input.metric, input.threshold);
  return (
    `【持续异常】${input.greenhouseId} ${label}已连续 ${input.streakMinutes} 分钟${input.operator}${threshold}（当前 ${current}）。` +
    "建议检查通风或侧帘状态。"
  );
}

export function buildGreenhouseSustainedL2Plan(
  input: GreenhouseSustainedL2Input,
): GreenhouseSustainedL2Plan | null {
  if (!isUpperBoundBreach(input.operator)) return null;

  if (input.metric === "humidity_percent") {
    return {
      cooldownKeyPrefix: "sustained-humidity-l2",
      templateText:
        `【运营建议】${input.greenhouseId} 湿度已连续 ${input.streakMinutes} 分钟偏高（当前 ${input.current}%）。` +
        "建议开通风 10 分钟降湿防病。请回复「确认」执行，或「取消」忽略。",
      summaryData: {
        greenhouse_id: input.greenhouseId,
        humidity_percent: input.current,
        streak_minutes: input.streakMinutes,
      },
      confirmIntent: pulseVentIntent(input.greenhouseId),
      sceneSkillId: resolveSceneForTrigger({ type: "sustained_humidity_l2" }) ?? undefined,
    };
  }

  if (input.metric !== "temperature_c") return null;

  const maxTemp = input.operator === ">=" ? input.threshold : Math.ceil(input.threshold);
  const fanId = resolveFanIdForGreenhouse(input.greenhouseId, input.devices);
  const isEmergencyHeat = input.current >= HIGH_TEMP_FAN_C;
  const templateText =
    isEmergencyHeat && fanId
      ? `【高温应急】${input.greenhouseId} 温度已连续 ${input.streakMinutes} 分钟偏高（当前 ${input.current}°C）。建议开风机 10 分钟紧急降温。请回复「确认」执行，或「取消」忽略。`
      : isEmergencyHeat
        ? `【高温应急】${input.greenhouseId} 温度已连续 ${input.streakMinutes} 分钟偏高（当前 ${input.current}°C）。未配置风机，建议开通风 10 分钟紧急降温。请回复「确认」执行，或「取消」忽略。`
        : `【运营建议】${input.greenhouseId} 温度已连续 ${input.streakMinutes} 分钟偏高。建议开启夜间通风模式（高于 ${maxTemp}°C 自动开帘控温）。请回复「确认」执行，或「取消」忽略。`;

  return {
    cooldownKeyPrefix: "sustained-l2",
    templateText,
    summaryData: {
      greenhouse_id: input.greenhouseId,
      max_temp_c: maxTemp,
      streak_minutes: input.streakMinutes,
      temperature_c: input.current,
    },
    confirmIntent:
      isEmergencyHeat && fanId
        ? highTempFanIntent(input.greenhouseId, fanId)
        : isEmergencyHeat
          ? pulseVentIntent(input.greenhouseId)
          : nightVentIntent(input.greenhouseId, maxTemp),
    sceneSkillId:
      (isEmergencyHeat
        ? resolveSceneForTrigger({
            type: "sustained_temp_l1",
            threshold_c: input.threshold,
            current_c: input.current,
          })
        : resolveSceneForTrigger({ type: "sustained_temp_l2" })) ?? undefined,
  };
}

function toGreenhouseSustainedInput(
  input: DomainPackSustainedAlertInput,
): GreenhouseSustainedL2Input {
  return {
    greenhouseId: input.entityId,
    metric: toGreenhouseMetric(input.metric),
    operator: input.operator,
    threshold: input.threshold,
    current: input.current,
    streakMinutes: input.streakMinutes,
    devices: input.devices,
  };
}

export const GREENHOUSE_PROACTIVE_ALERTS: DomainPackProactiveAlerts = {
  sustainedL1Message(input) {
    return buildGreenhouseSustainedL1Message(toGreenhouseSustainedInput(input));
  },
  sustainedL2Plan(input) {
    return buildGreenhouseSustainedL2Plan(toGreenhouseSustainedInput(input));
  },
};
