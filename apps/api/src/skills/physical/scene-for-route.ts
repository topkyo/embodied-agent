import type { IntentPayload } from "@embodied-agent/core";
import {
  resolveSceneForTrigger,
  resolveSceneFromIntent,
  type SceneSkillId,
} from "../../scene/registry.js";
import type { RouteContext } from "../route-context.js";

export function resolveSceneForRoute(
  intent: IntentPayload,
  ctx: RouteContext,
  device?: { manual_override?: boolean },
  safetyReason?: string,
): SceneSkillId | undefined {
  if (ctx.scene_skill_id) return ctx.scene_skill_id;
  if (device?.manual_override || safetyReason?.includes("手动优先")) {
    return resolveSceneForTrigger({ type: "manual_override_reject" }) ?? undefined;
  }
  return resolveSceneFromIntent(intent) ?? undefined;
}
