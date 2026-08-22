import type { RiskLevel } from "@embodied-agent/core";
import type { SceneSkillId } from "./registry.js";

const SCENE_RISK: Record<SceneSkillId, RiskLevel> = {
  night_ventilation_control: "L2",
  high_temp_emergency_response: "L2",
  humidity_mildew_prevention: "L2",
  cold_wave_protection: "L2",
  post_irrigation_ventilation: "L2",
  morning_dew_reduction: "L1",
  worker_manual_override_review: "L1",
  device_efficiency_diagnosis: "L1",
};

export function riskLevelForScene(scene_skill_id: string): RiskLevel | undefined {
  if (!(scene_skill_id in SCENE_RISK)) return undefined;
  return SCENE_RISK[scene_skill_id as SceneSkillId];
}

export function riskLevelForPhysicalSkill(
  skill: string,
  opts?: { requires_confirmation?: boolean; scene_skill_id?: string },
): RiskLevel {
  if (opts?.scene_skill_id) {
    return riskLevelForScene(opts.scene_skill_id) ?? "L2";
  }
  if (skill === "alert.set_threshold") {
    return "L4";
  }
  if (skill === "greenhouse.set_mode") return "L3";
  if (opts?.requires_confirmation) return "L3";
  if (
    skill === "greenhouse.open_vent" ||
    skill === "greenhouse.close_vent" ||
    skill === "fan.start" ||
    skill === "irrigation.start"
  ) {
    return "L2";
  }
  return "L0";
}
