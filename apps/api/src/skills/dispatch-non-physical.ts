import type { IntentPayload } from "@embodied-agent/core";
import { createLogger } from "@embodied-agent/platform";
import { appendOperationLog } from "../db/log.js";
import { buildIntentAuditParams } from "../db/intent-audit-params.js";
import { executeSkill } from "./handlers/index.js";
import type { RouteContext } from "./route-context.js";

const log = createLogger("dispatch-non-physical");

export async function dispatchNonPhysicalSkill(
  intent: IntentPayload,
  ctx: Pick<RouteContext, "user_id" | "model">,
): Promise<{ reply: string; status: number }> {
  try {
    const { reply, params } = await executeSkill(intent, {
      user_id: ctx.user_id,
    });
    appendOperationLog({
      user_id: ctx.user_id,
      skill: intent.skill,
      intent_source: "llm",
      model: ctx.model,
      params: { ...buildIntentAuditParams(intent), ...params },
      result: "completed",
      message: reply,
    });
    return { reply, status: 200 };
  } catch (e) {
    const reply = "技能执行失败，请稍后重试。";
    log.error("non-physical skill execution failed", {
      skill: intent.skill,
      error: e instanceof Error ? e.message : String(e),
    });
    appendOperationLog({
      user_id: ctx.user_id,
      skill: intent.skill,
      intent_source: "llm",
      model: ctx.model,
      params: buildIntentAuditParams(intent),
      result: "failed",
      message: e instanceof Error ? e.message : String(e),
    });
    return { reply, status: 503 };
  }
}
