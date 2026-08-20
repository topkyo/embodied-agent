import type { IntentPayload } from "@embodied-agent/core";
import { executeDomainSkillHandler } from "@embodied-agent/runtime";
import { getPlatformRuntimeContext } from "../../runtime/context.js";

export type HandlerContext = {
  user_id: string;
};

export type HandlerResult = {
  reply: string;
  params: Record<string, unknown>;
};

export async function executeSkill(
  intent: IntentPayload,
  ctx: HandlerContext,
): Promise<HandlerResult> {
  const domainResult = await executeDomainSkillHandler(getPlatformRuntimeContext(), intent, {
    userId: ctx.user_id,
  });
  if (domainResult) return domainResult;

  return { reply: "暂不支持该技能。", params: {} };
}
