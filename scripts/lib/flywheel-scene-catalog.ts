import { getSceneSkillIds, type SceneSkillId } from "../../apps/api/src/scene/registry.js";

export function getAllSceneSkillIds(): readonly SceneSkillId[] {
  return getSceneSkillIds();
}

export type SceneCoverage = {
  scene_skill_id: SceneSkillId;
  /** outcome 写入 scene-outcomes.jsonl */
  via_outcome?: boolean;
  /** 操作日志 / 简报 / 推送文案可检索 */
  via_attestation?: boolean;
};

export const FLYWHEEL_SCENE_COVERAGE: SceneCoverage[] = [
  { scene_skill_id: "night_ventilation_control", via_outcome: true, via_attestation: true },
  { scene_skill_id: "high_temp_emergency_response", via_outcome: true, via_attestation: true },
  { scene_skill_id: "humidity_mildew_prevention", via_outcome: true, via_attestation: true },
  { scene_skill_id: "cold_wave_protection", via_attestation: true },
  { scene_skill_id: "post_irrigation_ventilation", via_outcome: true, via_attestation: true },
  { scene_skill_id: "morning_dew_reduction", via_attestation: true },
  { scene_skill_id: "worker_manual_override_review", via_attestation: true },
  { scene_skill_id: "device_efficiency_diagnosis", via_attestation: true },
];

function sceneCovered(
  cov: SceneCoverage,
  outcomes: Set<SceneSkillId>,
  attestations: Set<SceneSkillId>,
): boolean {
  if (cov.via_outcome && outcomes.has(cov.scene_skill_id)) return true;
  if (cov.via_attestation && attestations.has(cov.scene_skill_id)) return true;
  return false;
}

export function missingScenes(
  outcomes: SceneSkillId[],
  attestations: SceneSkillId[],
): SceneSkillId[] {
  const outcomeSet = new Set(outcomes);
  const attestationSet = new Set(attestations);
  return FLYWHEEL_SCENE_COVERAGE.filter(
    (cov) => !sceneCovered(cov, outcomeSet, attestationSet),
  ).map((cov) => cov.scene_skill_id);
}
