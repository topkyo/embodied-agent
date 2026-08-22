import type { DomainPackSkillHandlerResult, IntentPayload } from "@embodied-agent/core";
import { formatGreenhouseLabel } from "./labels.js";

type StatusReportSchedule = {
  id: string;
  user_id: string;
  entity_ids: string[];
  interval_minutes: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  last_sent_at?: string;
};

type ReportScheduleServices = {
  listForUser?: (userId: string) => StatusReportSchedule[];
};

const REPORT_SKILLS = new Set([
  "report.set_schedule",
  "report.cancel_schedule",
  "report.query_schedule",
]);

export function canHandleGreenhouseReportSkill(intent: IntentPayload): boolean {
  return REPORT_SKILLS.has(intent.skill);
}

function reportScheduleServices(context: {
  services?: Record<string, unknown>;
}): ReportScheduleServices {
  const value = context.services?.reportSchedules;
  return value && typeof value === "object" ? (value as ReportScheduleServices) : {};
}

export async function handleGreenhouseReportSkill(
  intent: IntentPayload,
  context: {
    domainConfig?: unknown;
    deploymentId: string;
    userId?: string;
    services?: Record<string, unknown>;
  },
): Promise<DomainPackSkillHandlerResult> {
  const params = intent.parameters as { greenhouse_ids?: string[]; interval_minutes?: number };
  if (intent.skill === "report.set_schedule") {
    const gh = (params.greenhouse_ids ?? []).map(formatGreenhouseLabel).join("、");
    return {
      reply: `已开启定时汇报：${gh} 每 ${params.interval_minutes} 分钟向您推送温湿度。（关闭可说：取消定时汇报）`,
      params: { ...intent.parameters },
    };
  }

  if (intent.skill === "report.cancel_schedule") {
    return {
      reply: "已关闭定时状态汇报。",
      params: {},
    };
  }

  if (intent.skill === "report.query_schedule") {
    const userId = context.userId;
    const schedules = reportScheduleServices(context);
    const rows = userId ? (schedules.listForUser?.(userId) ?? []) : [];
    if (rows.length === 0) {
      return { reply: "当前没有启用的定时汇报。", params: { count: 0 } };
    }
    const sched = rows[0]!;
    const gh = sched.entity_ids.map(formatGreenhouseLabel).join("、");
    return {
      reply: `定时汇报：${gh} 每 ${sched.interval_minutes} 分钟推送温湿度。`,
      params: { schedule: sched },
    };
  }

  return { reply: "暂不支持该定时汇报技能。", params: {} };
}
