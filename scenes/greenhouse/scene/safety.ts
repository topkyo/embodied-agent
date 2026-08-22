import type {
  DomainPackSafetyContext,
  DomainPackSafetyDecision,
  DomainPackSafetyPolicy,
  IntentPayload,
} from "@embodied-agent/core";
import { GREENHOUSE_PHYSICAL_SKILLS } from "../skills.js";

const GREENHOUSE_WORKER_ALLOWED_SKILLS = [
  "greenhouse.query_status",
  "greenhouse.query_all_status",
  "alert.query_threshold",
  "alert.query_today",
  "command.query_status",
  "fan.start",
  "fan.stop",
] as const;

const GREENHOUSE_READONLY_ALLOWED_SKILLS = [
  "greenhouse.query_status",
  "greenhouse.query_all_status",
  "log.query_today",
  "alert.query_threshold",
  "alert.query_today",
  "report.query_schedule",
  "command.query_status",
  "weather.query_forecast",
  "weather.query_alert",
  "satellite.query_ndvi",
  "agronomy.query_pest",
  "tasks.query_task",
  "advice.query_weekly",
] as const;

const GREENHOUSE_PRIVILEGED_SKILLS = [
  "alert.set_threshold",
  "alert.clear_threshold",
  "report.set_schedule",
  "report.cancel_schedule",
  "greenhouse.set_mode",
] as const;

function numberParam(intent: IntentPayload, key: string): number | undefined {
  const params = intent.parameters as Record<string, unknown> | undefined;
  const value = params?.[key];
  return typeof value === "number" ? value : undefined;
}

function greenhouseRequestedDurationSeconds(intent: IntentPayload): number | undefined {
  if (
    intent.skill === "greenhouse.open_vent" ||
    intent.skill === "greenhouse.close_vent" ||
    intent.skill === "fan.start" ||
    intent.skill === "irrigation.start"
  ) {
    return numberParam(intent, "duration_seconds");
  }
  return undefined;
}

function greenhouseInterlockAction(intent: IntentPayload): "open" | "close" | undefined {
  if (intent.skill === "greenhouse.open_vent") return "open";
  if (intent.skill === "greenhouse.close_vent") return "close";
  return undefined;
}

function greenhouseSafetyDecision(ctx: DomainPackSafetyContext): DomainPackSafetyDecision | null {
  if (ctx.skill === "greenhouse.set_mode") {
    const params = ctx.intent.parameters as
      | {
          mode?: string;
          temp_high_c?: number;
          max_temp_c?: number;
        }
      | undefined;
    if (params?.mode === "night_vent") {
      const { temp_high_c, max_temp_c } = params ?? {};
      const high = temp_high_c ?? max_temp_c ?? 30;
      if (high > 40) {
        return {
          allowed: false,
          requires_confirmation: false,
          reason: "夜间降温目标温度不能超过 40°C。",
        };
      }
      return {
        allowed: true,
        requires_confirmation: true,
        reason: "将启用夜间自动通风模式（按温度自动开关侧帘）。",
      };
    }
    if (params?.mode === "off") {
      return {
        allowed: true,
        requires_confirmation: false,
        reason: "允许关闭环控模式。",
      };
    }
  }

  if (
    ctx.skill === "fan.start" &&
    (greenhouseRequestedDurationSeconds(ctx.intent) === undefined ||
      greenhouseRequestedDurationSeconds(ctx.intent)! <= 0)
  ) {
    return {
      allowed: false,
      requires_confirmation: false,
      reason: "风机启动须说明运行时长，例如「开 10 分钟」。",
    };
  }

  return null;
}

export const GREENHOUSE_SAFETY_POLICY: DomainPackSafetyPolicy = {
  confirmDurationThresholdSeconds: 600,
  authorization: {
    controlSkills: GREENHOUSE_PHYSICAL_SKILLS,
    workerAllowedSkills: GREENHOUSE_WORKER_ALLOWED_SKILLS,
    readonlyAllowedSkills: GREENHOUSE_READONLY_ALLOWED_SKILLS,
    privilegedSkills: GREENHOUSE_PRIVILEGED_SKILLS,
    denialReasons: {
      worker: "工人账号无权执行该操作。",
      readonly: "当前账号仅可查看，不能控制设备。",
      privileged: "仅农场主或管理员可执行该操作。",
      skill: {
        "alert.set_threshold": "仅农场主或管理员可修改报警阈值。",
        "alert.clear_threshold": "仅农场主或管理员可修改报警阈值。",
        "report.set_schedule": "仅农场主或管理员可设置定时汇报。",
        "report.cancel_schedule": "仅农场主或管理员可设置定时汇报。",
        "greenhouse.set_mode": "仅农场主或管理员可设置环控模式。",
      },
    },
  },
  requestedDurationSeconds: greenhouseRequestedDurationSeconds,
  interlockAction: greenhouseInterlockAction,
  interlockConflictReason: "通风设备正在相反方向运行，请先停止。",
  interlockConflictGuidance: "可以说「停止 1 号棚通风」后再重新开帘。",
  evaluateIntent: greenhouseSafetyDecision,
  stopSkills: ["greenhouse.stop_vent", "fan.stop"],
  stopReason: "允许执行停止操作。",
};
