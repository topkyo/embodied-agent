import type { DomainPackOutcomeEvaluationInput, IntentPayload } from "@embodied-agent/core";
import { outcomeThresholdsForScene } from "./outcome-thresholds.js";

export const SCENE_SKILL_IDS = [
  "night_ventilation_control",
  "high_temp_emergency_response",
  "humidity_mildew_prevention",
  "cold_wave_protection",
  "post_irrigation_ventilation",
  "morning_dew_reduction",
  "worker_manual_override_review",
  "device_efficiency_diagnosis",
] as const;

export type SceneSkillId = (typeof SCENE_SKILL_IDS)[number];

export type SceneTrigger =
  | { type: "sustained_temp_l1"; threshold_c: number; current_c: number }
  | { type: "sustained_temp_l2" }
  | { type: "sustained_humidity_l2" }
  | { type: "weather_cold" }
  | { type: "weather_heat_l2" }
  | { type: "irrigation_completed" }
  | { type: "digest_morning_high_humidity" }
  | { type: "manual_override_reject" }
  | { type: "device_repeated_failure" }
  | { type: "intent"; intent: IntentPayload };

const HIGH_TEMP_THRESHOLD_C = 35;

export function isSceneSkillId(id: string): id is SceneSkillId {
  return (SCENE_SKILL_IDS as readonly string[]).includes(id);
}

export function resolveSceneForTrigger(trigger: SceneTrigger): SceneSkillId | null {
  switch (trigger.type) {
    case "sustained_temp_l2":
      return "night_ventilation_control";
    case "sustained_temp_l1":
      if (
        trigger.threshold_c >= HIGH_TEMP_THRESHOLD_C ||
        trigger.current_c >= HIGH_TEMP_THRESHOLD_C
      ) {
        return "high_temp_emergency_response";
      }
      return "night_ventilation_control";
    case "sustained_humidity_l2":
      return "humidity_mildew_prevention";
    case "weather_cold":
      return "cold_wave_protection";
    case "weather_heat_l2":
      return "night_ventilation_control";
    case "irrigation_completed":
      return "post_irrigation_ventilation";
    case "digest_morning_high_humidity":
      return "morning_dew_reduction";
    case "manual_override_reject":
      return "worker_manual_override_review";
    case "device_repeated_failure":
      return "device_efficiency_diagnosis";
    case "intent":
      return resolveSceneFromIntent(trigger.intent);
    default:
      return null;
  }
}

export function resolveSceneFromIntent(intent: IntentPayload): SceneSkillId | null {
  const parameters = intent.parameters as { mode?: string } | undefined;
  if (intent.skill === "greenhouse.set_mode" && parameters?.mode === "night_vent") {
    return "night_ventilation_control";
  }
  // 灌后通风场景仅由 irrigation_completed hook + 用户确认后的 open_vent 挂接；
  // irrigation.start 本身不挂 scene，避免飞轮 outcome 与 L2 推送时刻漂移。
  return null;
}

export function sceneSuccessMetric(
  scene_skill_id: SceneSkillId,
): "temperature" | "humidity" | "completion" {
  if (
    scene_skill_id === "humidity_mildew_prevention" ||
    scene_skill_id === "morning_dew_reduction" ||
    scene_skill_id === "post_irrigation_ventilation"
  ) {
    return "humidity";
  }
  if (
    scene_skill_id === "cold_wave_protection" ||
    scene_skill_id === "worker_manual_override_review" ||
    scene_skill_id === "device_efficiency_diagnosis"
  ) {
    return "completion";
  }
  return "temperature";
}

function numberMetric(row: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = row?.[key];
  return typeof value === "number" ? value : undefined;
}

export function evaluateOutcomeSuccess(input: DomainPackOutcomeEvaluationInput): boolean {
  // 失败可见：非 completed 状态一律不判成功，即使遥测 delta 达标。
  if (input.command_status !== "completed") return false;
  const metric = sceneSuccessMetric(input.scene_skill_id as SceneSkillId);
  if (metric === "completion") return true;
  const thresholds = outcomeThresholdsForScene(input.scene_skill_id);
  if (metric === "humidity") {
    const before = numberMetric(input.before, "humidity_percent");
    const after = numberMetric(input.after, "humidity_percent");
    if (before === undefined || after === undefined) return false;
    return after - before < (thresholds.humidity_delta_max ?? -3);
  }
  const before = numberMetric(input.before, "temperature_c");
  const after = numberMetric(input.after, "temperature_c");
  if (before === undefined || after === undefined) return false;
  return after - before < (thresholds.temperature_delta_max ?? -0.5);
}
