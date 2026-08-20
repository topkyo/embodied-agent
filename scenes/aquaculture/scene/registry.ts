import type {
  DomainPackOutcomeEvaluationInput,
  IntentPayload,
  OutcomeThresholds,
  RiskLevel,
} from "@embodied-agent/core";

export type SceneTrigger = { type: string; [key: string]: unknown };

export const SCENE_SKILL_IDS: readonly string[] = [];

export function isSceneSkillId(_id: string): boolean {
  return false;
}

export function resolveSceneForTrigger(_trigger: SceneTrigger): string | null {
  return null;
}

export function resolveSceneFromIntent(_intent: IntentPayload): string | null {
  return null;
}

export function sceneSuccessMetric(
  _scene_skill_id: string,
): "temperature" | "humidity" | "completion" {
  return "completion";
}

export function evaluateOutcomeSuccess(input: DomainPackOutcomeEvaluationInput): boolean {
  return input.command_status === "completed";
}

export function riskLevelForScene(_scene_skill_id: string): RiskLevel | undefined {
  return undefined;
}

export function riskLevelForPhysicalSkill(
  _skill: string,
  _opts?: { requires_confirmation?: boolean; scene_skill_id?: string },
): RiskLevel {
  return "L2";
}

export function outcomeThresholdsForScene(_scene_skill_id: string): OutcomeThresholds {
  return {};
}
