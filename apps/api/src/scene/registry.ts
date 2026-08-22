import type { IntentPayload, SceneTrigger } from "@embodied-agent/core";
import { activeSceneRuntime } from "@embodied-agent/runtime";
import { getPlatformRuntimeContext } from "../runtime/context.js";

export type SceneSkillId = string;
export type { SceneTrigger };

/** 延迟读取，避免模块加载时早于 preloadDomainPacks() */
export function getSceneSkillIds(): readonly string[] {
  return activeSceneRuntime(getPlatformRuntimeContext()).sceneSkillIds;
}

export function isSceneSkillId(id: string): id is SceneSkillId {
  return activeSceneRuntime(getPlatformRuntimeContext()).isSceneSkillId(id);
}

export function resolveSceneForTrigger(trigger: SceneTrigger): SceneSkillId | null {
  return activeSceneRuntime(getPlatformRuntimeContext()).resolveSceneForTrigger(trigger);
}

export function resolveSceneFromIntent(intent: IntentPayload): SceneSkillId | null {
  return activeSceneRuntime(getPlatformRuntimeContext()).resolveSceneFromIntent(intent);
}

export function sceneSuccessMetric(scene_skill_id: SceneSkillId): string {
  return activeSceneRuntime(getPlatformRuntimeContext()).sceneSuccessMetric(scene_skill_id);
}
