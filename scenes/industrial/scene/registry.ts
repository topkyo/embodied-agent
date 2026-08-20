import type {
  DomainPackOutcomeEvaluationInput,
  IntentPayload,
  OutcomeThresholds,
  RiskLevel,
} from "@embodied-agent/core";

export const SCENE_SKILL_IDS = ["industrial_overheat_exhaust"] as const;

export type SceneSkillId = (typeof SCENE_SKILL_IDS)[number];
export type SceneTrigger = { type: string; [key: string]: unknown };

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function isSceneSkillId(id: string): id is SceneSkillId {
  return (SCENE_SKILL_IDS as readonly string[]).includes(id);
}

export function resolveSceneForTrigger(trigger: SceneTrigger): SceneSkillId | null {
  return trigger.type === "industrial_overheat" ? "industrial_overheat_exhaust" : null;
}

export function resolveSceneFromIntent(intent: IntentPayload): SceneSkillId | null {
  if (
    intent.skill === "industrial.start_exhaust" ||
    intent.skill === "industrial.stop_exhaust" ||
    intent.skill === "industrial.query_status"
  ) {
    return "industrial_overheat_exhaust";
  }
  return null;
}

export function sceneSuccessMetric(
  _scene_skill_id: string,
): "temperature" | "humidity" | "completion" {
  return "temperature";
}

export function evaluateOutcomeSuccess(input: DomainPackOutcomeEvaluationInput): boolean {
  if (input.command_status !== "completed") return false;
  const before = numberField(input.before?.temperature_c);
  const after = numberField(input.after?.temperature_c);
  if (before === undefined || after === undefined) return false;
  return after <= before - 1;
}

export function riskLevelForScene(scene_skill_id: string): RiskLevel | undefined {
  return isSceneSkillId(scene_skill_id) ? "L2" : undefined;
}

export function riskLevelForPhysicalSkill(
  skill: string,
  opts?: { requires_confirmation?: boolean; scene_skill_id?: string },
): RiskLevel {
  if (opts?.requires_confirmation) return "L2";
  return skill === "industrial.start_exhaust" ? "L2" : "L1";
}

export function outcomeThresholdsForScene(_scene_skill_id: string): OutcomeThresholds {
  return { temperature_delta_max: -1 };
}
