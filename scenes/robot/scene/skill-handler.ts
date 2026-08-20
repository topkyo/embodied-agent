import type { DomainPackSkillHandlerResult, IntentPayload } from "@embodied-agent/core";
import { canHandleRobotQuerySkill, handleRobotQuerySkill } from "../m20/query-handler.js";
import { canHandleRobotInspectionSkill, handleRobotInspectionSkill } from "./inspection-handler.js";

type RobotSkillHandlerContext = {
  domainConfig?: unknown;
  deploymentId: string;
  userId?: string;
  services?: Record<string, unknown>;
};

export function canHandleRobotSkill(intent: IntentPayload): boolean {
  return canHandleRobotQuerySkill(intent) || canHandleRobotInspectionSkill(intent);
}

export async function handleRobotSkill(
  intent: IntentPayload,
  context: RobotSkillHandlerContext,
): Promise<DomainPackSkillHandlerResult> {
  if (canHandleRobotQuerySkill(intent)) {
    return handleRobotQuerySkill(intent, context);
  }
  if (canHandleRobotInspectionSkill(intent)) {
    return handleRobotInspectionSkill(intent, context);
  }
  return { reply: "暂不支持该机器人领域技能。", params: {} };
}
