import type { DomainPackSkillHandlerResult, IntentPayload } from "@embodied-agent/core";
import { canHandleGreenhouseAlertSkill, handleGreenhouseAlertSkill } from "./alert-handler.js";
import { canHandleGreenhouseQuerySkill, handleGreenhouseQuerySkill } from "./query-handler.js";
import { canHandleGreenhouseReportSkill, handleGreenhouseReportSkill } from "./report-handler.js";
import {
  canHandleGreenhouseIrrigationSkill,
  handleGreenhouseIrrigationSkill,
} from "./irrigation-handler.js";
import {
  canHandleGreenhousePhysicalReplySkill,
  handleGreenhousePhysicalReplySkill,
} from "./physical-control-handler.js";
import {
  canHandleGreenhouseHistorySkill,
  handleGreenhouseHistorySkill,
} from "./history-handler.js";
import { canHandleGreenhouseP2Skill, handleGreenhouseP2Skill } from "./p2-handler.js";

type GreenhouseSkillHandlerContext = {
  domainConfig?: unknown;
  deploymentId: string;
  userId?: string;
  services?: Record<string, unknown>;
};

type WeatherService = {
  handle(intent: IntentPayload): Promise<DomainPackSkillHandlerResult>;
};

function canHandleGreenhouseWeatherSkill(intent: IntentPayload): boolean {
  return intent.skill === "weather.query_forecast" || intent.skill === "weather.query_alert";
}

function weatherService(context: GreenhouseSkillHandlerContext): WeatherService {
  const value = context.services?.weather;
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as WeatherService).handle !== "function"
  ) {
    throw new Error("agriculture Domain Pack 缺少 weather 平台服务。");
  }
  return value as WeatherService;
}

export function canHandleGreenhouseSkill(intent: IntentPayload): boolean {
  return (
    canHandleGreenhouseQuerySkill(intent) ||
    canHandleGreenhouseWeatherSkill(intent) ||
    canHandleGreenhouseAlertSkill(intent) ||
    canHandleGreenhouseReportSkill(intent) ||
    canHandleGreenhouseIrrigationSkill(intent) ||
    canHandleGreenhousePhysicalReplySkill(intent) ||
    canHandleGreenhouseHistorySkill(intent) ||
    canHandleGreenhouseP2Skill(intent)
  );
}

export async function handleGreenhouseSkill(
  intent: IntentPayload,
  context: GreenhouseSkillHandlerContext,
): Promise<DomainPackSkillHandlerResult> {
  if (canHandleGreenhouseQuerySkill(intent)) {
    return handleGreenhouseQuerySkill(intent, context);
  }
  if (canHandleGreenhouseWeatherSkill(intent)) {
    return weatherService(context).handle(intent);
  }
  if (canHandleGreenhouseAlertSkill(intent)) {
    return handleGreenhouseAlertSkill(intent, context);
  }
  if (canHandleGreenhouseReportSkill(intent)) {
    return handleGreenhouseReportSkill(intent, context);
  }
  if (canHandleGreenhouseIrrigationSkill(intent)) {
    return handleGreenhouseIrrigationSkill(intent, context);
  }
  if (canHandleGreenhousePhysicalReplySkill(intent)) {
    return handleGreenhousePhysicalReplySkill(intent);
  }
  if (canHandleGreenhouseHistorySkill(intent)) {
    return handleGreenhouseHistorySkill(intent, context);
  }
  if (canHandleGreenhouseP2Skill(intent)) {
    return handleGreenhouseP2Skill(intent, context);
  }
  return { reply: "暂不支持该农业领域技能。", params: {} };
}
