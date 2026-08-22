import type { OutcomeThresholds } from "@embodied-agent/core";
import type { SceneSkillId } from "./registry.js";

const DEFAULT_THRESHOLDS: OutcomeThresholds = {
  humidity_delta_max: -3,
  temperature_delta_max: -0.5,
};

const SCENE_THRESHOLDS: Partial<Record<SceneSkillId, OutcomeThresholds>> = {
  humidity_mildew_prevention: { humidity_delta_max: -3 },
  morning_dew_reduction: { humidity_delta_max: -2 },
  post_irrigation_ventilation: { humidity_delta_max: -2 },
  high_temp_emergency_response: { temperature_delta_max: -0.8 },
  night_ventilation_control: { temperature_delta_max: -0.5 },
};

export function outcomeThresholdsForScene(scene_skill_id: string): OutcomeThresholds {
  const overrides = SCENE_THRESHOLDS[scene_skill_id as SceneSkillId];
  return { ...DEFAULT_THRESHOLDS, ...overrides };
}
