import type { IntentPayload } from "@embodied-agent/core";
import { domainPendingSummary, domainPhysicalCommandSentReply } from "@embodied-agent/runtime";
import { getPlatformRuntimeContext } from "../../runtime/context.js";

export function physicalCommandSentReply(skill: IntentPayload["skill"]): string {
  return (
    domainPhysicalCommandSentReply(getPlatformRuntimeContext(), skill) ??
    "设备指令已下发，正等待设备确认；若失败会通知您。"
  );
}

export function pendingSummary(intent: IntentPayload): string {
  return domainPendingSummary(getPlatformRuntimeContext(), intent) ?? intent.skill;
}
