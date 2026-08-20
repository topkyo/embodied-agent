import type { DomainPackSkillHandlerResult, IntentPayload } from "@embodied-agent/core";
import { formatIrrigationQueryReply, type IrrigationStatusServices } from "./irrigation-status.js";

export function canHandleGreenhouseIrrigationSkill(intent: IntentPayload): boolean {
  return intent.skill === "irrigation.query_status";
}

function irrigationStatusServices(context: {
  services?: Record<string, unknown>;
}): IrrigationStatusServices {
  const commands =
    context.services?.commands && typeof context.services.commands === "object"
      ? (context.services.commands as { list?: IrrigationStatusServices["listCommands"] })
      : {};
  const deviceRegistry =
    context.services?.deviceRegistry && typeof context.services.deviceRegistry === "object"
      ? (context.services.deviceRegistry as {
          listDevices?: IrrigationStatusServices["listDevices"];
        })
      : {};
  return {
    listCommands: commands.list,
    listDevices: deviceRegistry.listDevices,
  };
}

export async function handleGreenhouseIrrigationSkill(
  intent: IntentPayload,
  context: {
    domainConfig?: unknown;
    deploymentId: string;
    userId?: string;
    services?: Record<string, unknown>;
  },
): Promise<DomainPackSkillHandlerResult> {
  const target = intent.target as { zone_id?: string; greenhouse_id?: string };
  const services = irrigationStatusServices(context);
  if (!context.userId) {
    return {
      reply: "灌溉状态服务未配置。",
      params: { zone_id: target.zone_id, count: 0 },
    };
  }
  return formatIrrigationQueryReply(
    {
      zone_id: target.zone_id,
      greenhouse_id: target.greenhouse_id,
      user_id: context.userId,
    },
    services,
  );
}
