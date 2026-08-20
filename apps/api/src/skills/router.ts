import type { IntentPayload } from "@embodied-agent/core";
import { evaluateCommand } from "@embodied-agent/safety";
import { appendOperationLog } from "../db/log.js";
import { buildIntentAuditParams } from "../db/intent-audit-params.js";
import { resolveDeviceRuntimeState } from "../devices/runtime-state.js";
import { activeDomainSafetyPolicy } from "@embodied-agent/runtime";
import { isPhysicalControlSkill, resolveDeviceTarget } from "@embodied-agent/runtime";
import { getPlatformRuntimeContext } from "../runtime/context.js";
import { dispatchNonPhysicalSkill } from "./dispatch-non-physical.js";
import { intentToCommand } from "./physical/intent-to-command.js";
import { publishPhysicalCommand } from "./physical/publish-physical-command.js";
export type { RouteContext } from "./route-context.js";
import type { RouteContext } from "./route-context.js";
import {
  runAlertAndReportMutations,
  runConfirmationRoute,
  runDomainClarificationRoute,
  runSafetyRejectionRoute,
} from "./route-table/pre-dispatch.js";

export async function routeIntent(
  intent: IntentPayload,
  ctx: RouteContext,
): Promise<{ reply: string; status: number }> {
  const platformCtx = getPlatformRuntimeContext();
  const physical = isPhysicalControlSkill(platformCtx, intent);
  const resolved = physical ? resolveDeviceTarget(platformCtx, intent) : undefined;
  if (resolved?.ok === false) {
    const reason = resolved.reason;
    appendOperationLog({
      user_id: ctx.user_id,
      skill: intent.skill,
      intent_source: "llm",
      model: ctx.model,
      params: buildIntentAuditParams(intent),
      result: "rejected",
      message: reason,
    });
    return { reply: reason, status: 403 };
  }

  const target = resolved?.ok === true ? resolved.target : undefined;
  const device = target ? resolveDeviceRuntimeState(target) : undefined;
  const safety = evaluateCommand({
    user_id: ctx.user_id,
    role: ctx.role,
    skill: intent.skill,
    intent,
    device,
    confirm_duration_threshold_seconds: target?.device.confirm_duration_threshold_seconds,
    domainSafetyPolicy: activeDomainSafetyPolicy(platformCtx),
  });

  const domainClarify = runDomainClarificationRoute(intent, ctx);
  if (domainClarify.type === "reply") {
    return { reply: domainClarify.reply, status: domainClarify.status };
  }

  const safetyReject = runSafetyRejectionRoute(
    intent,
    ctx,
    safety,
    device,
    target?.device.entity_id,
  );
  if (safetyReject.type === "reply") {
    return { reply: safetyReject.reply, status: safetyReject.status };
  }

  const confirm = runConfirmationRoute(intent, ctx, safety, device);
  if (confirm.type === "reply") {
    return { reply: confirm.reply, status: confirm.status };
  }

  const mutation = runAlertAndReportMutations(intent, ctx);
  if (mutation.type === "reply") {
    return { reply: mutation.reply, status: mutation.status };
  }

  if (physical && target) {
    const cmd = intentToCommand(intent, ctx, target);
    if (!cmd) {
      appendOperationLog({
        user_id: ctx.user_id,
        skill: intent.skill,
        intent_source: "llm",
        model: ctx.model,
        params: buildIntentAuditParams(intent),
        result: "rejected",
        message: "无法构建指令（缺少会话上下文或设备配置不匹配）",
      });
      return { reply: "无法构建指令，请稍后重试。", status: 400 };
    }
    return publishPhysicalCommand({
      intent,
      ctx,
      target,
      device,
      safety,
      cmd,
    });
  }

  return dispatchNonPhysicalSkill(intent, ctx);
}
