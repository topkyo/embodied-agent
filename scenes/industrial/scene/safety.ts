import type {
  DomainPackSafetyContext,
  DomainPackSafetyDecision,
  DomainPackSafetyPolicy,
  IntentPayload,
} from "@embodied-agent/core";
import { INDUSTRIAL_PHYSICAL_SKILLS } from "../skills.js";

const INDUSTRIAL_QUERY_SKILLS = ["industrial.query_status", "command.query_status"] as const;

function durationSeconds(intent: IntentPayload): number | undefined {
  const value = intent.parameters?.duration_seconds;
  return typeof value === "number" ? value : undefined;
}

function industrialRequestedDurationSeconds(intent: IntentPayload): number | undefined {
  return intent.skill === "industrial.start_exhaust" ? durationSeconds(intent) : undefined;
}

function industrialSafetyDecision(ctx: DomainPackSafetyContext): DomainPackSafetyDecision | null {
  if (ctx.skill === "industrial.start_exhaust") {
    const duration = industrialRequestedDurationSeconds(ctx.intent);
    if (!duration || duration <= 0) {
      return {
        allowed: false,
        requires_confirmation: false,
        reason: "启动排风必须说明运行时长。",
      };
    }
    return {
      allowed: true,
      requires_confirmation: true,
      reason: "将启动现场排风设备，需要二次确认。",
    };
  }
  if (ctx.skill === "industrial.stop_exhaust") {
    return {
      allowed: true,
      requires_confirmation: false,
      reason: "允许停止排风设备。",
    };
  }
  return null;
}

export const INDUSTRIAL_SAFETY_POLICY: DomainPackSafetyPolicy = {
  confirmDurationThresholdSeconds: 600,
  authorization: {
    controlSkills: INDUSTRIAL_PHYSICAL_SKILLS,
    workerAllowedSkills: [...INDUSTRIAL_QUERY_SKILLS, "industrial.stop_exhaust"],
    readonlyAllowedSkills: INDUSTRIAL_QUERY_SKILLS,
    denialReasons: {
      worker: "工人账号无权启动工业排风设备。",
      readonly: "当前账号仅可查看，不能控制工业设备。",
    },
  },
  requestedDurationSeconds: industrialRequestedDurationSeconds,
  evaluateIntent: industrialSafetyDecision,
  stopSkills: ["industrial.stop_exhaust"],
  stopReason: "允许停止排风设备。",
};
