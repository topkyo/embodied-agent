import type {
  DomainPackSkillHandlerResult,
  IntentPayload,
  SceneModeState,
} from "@embodied-agent/core";
import {
  formatCommandStatusReply,
  formatSetModeSummaryLines,
  mapQueryActionToStored,
  type GreenhouseCommandRecord,
} from "./command-status.js";

type AlertEvent = {
  ts: string;
  message: string;
};

type OperationLogEntry = {
  ts: string;
  user_id: string;
  skill: string;
  result: string;
};

type AlertEventServices = {
  queryToday?: (deploymentId: string, greenhouseId?: string) => AlertEvent[];
};

type OperationLogServices = {
  queryToday?: (deploymentId: string, entityId?: string) => OperationLogEntry[];
};

type CommandStatusServices = {
  get?: (commandId: string) => GreenhouseCommandRecord | undefined;
  findForUser?: (
    userId: string,
    opts?: { action?: string; entity_id?: string; limit?: number },
  ) => GreenhouseCommandRecord[];
};

type ModeServices = {
  getByEntityId?: (entityId: string) => SceneModeState | undefined | null;
};

type DeviceRegistryServices = {
  entityIdFromDeviceId?: (deviceId: string) => string | undefined;
};

const HISTORY_SKILLS = new Set(["alert.query_today", "log.query_today", "command.query_status"]);

export function canHandleGreenhouseHistorySkill(intent: IntentPayload): boolean {
  return HISTORY_SKILLS.has(intent.skill);
}

function service<T>(context: { services?: Record<string, unknown> }, key: string): T {
  const value = context.services?.[key];
  return value && typeof value === "object" ? (value as T) : ({} as T);
}

export async function handleGreenhouseHistorySkill(
  intent: IntentPayload,
  context: {
    domainConfig?: unknown;
    deploymentId: string;
    userId?: string;
    services?: Record<string, unknown>;
  },
): Promise<DomainPackSkillHandlerResult> {
  if (intent.skill === "alert.query_today") {
    const deploymentId = context.deploymentId;
    const gh = intent.target.greenhouse_id as string | undefined;
    const alerts = service<AlertEventServices>(context, "alertEvents");
    const events = alerts.queryToday?.(deploymentId, gh) ?? [];
    if (events.length === 0) {
      return { reply: "今天还没有报警记录。", params: { count: 0 } };
    }
    const lines = events.map((e) => `${e.ts.slice(11, 19)} ${e.message}`);
    return {
      reply: `今日报警（${events.length} 条）：\n${lines.join("\n")}`,
      params: { count: events.length },
    };
  }

  if (intent.skill === "log.query_today") {
    const deploymentId = context.deploymentId;
    const gh = intent.target.greenhouse_id as string | undefined;
    const operationLogs = service<OperationLogServices>(context, "operationLogs");
    const rows = operationLogs.queryToday?.(deploymentId, gh) ?? [];
    if (rows.length === 0) {
      return { reply: "今天还没有操作记录。", params: {} };
    }
    const lines = rows.map((r) => `${r.ts} ${r.user_id} ${r.skill} → ${r.result}`);
    return { reply: lines.join("\n"), params: { count: rows.length } };
  }

  if (intent.skill === "command.query_status") {
    const userId = context.userId;
    const commands = service<CommandStatusServices>(context, "commands");
    const modes = service<ModeServices>(context, "mode");
    const deviceRegistry = service<DeviceRegistryServices>(context, "deviceRegistry");
    const formatServices = {
      entityIdFromDeviceId: deviceRegistry.entityIdFromDeviceId,
      getModeByEntityId: modes.getByEntityId,
    };

    if (!userId) {
      return { reply: "无权查看该指令状态。", params: {} };
    }

    if (intent.parameters?.command_id) {
      const record = commands.get?.(intent.parameters.command_id as string);
      if (!record) {
        return {
          reply: `未找到指令 ${intent.parameters.command_id}。`,
          params: {},
        };
      }
      if (record.command.issued_by.user_id !== userId) {
        return { reply: "无权查看该指令状态。", params: {} };
      }
      return {
        reply: formatCommandStatusReply(record, formatServices),
        params: {
          command_id: record.command_id,
          status: record.status,
          device_id: record.command.device_id,
          action: record.command.action,
        },
      };
    }

    const ghId = intent.target.greenhouse_id as string | undefined;
    const queryAction = intent.parameters?.action as string | undefined;
    const actionFilter = mapQueryActionToStored(queryAction);
    const records =
      commands.findForUser?.(userId, {
        action: actionFilter,
        entity_id: ghId,
        limit: actionFilter === "set_mode" && !ghId ? 20 : 1,
      }) ?? [];

    if (records.length === 0) {
      if (ghId && actionFilter === "set_mode") {
        const stored = modes.getByEntityId?.(ghId);
        if (stored?.mode === "night_vent") {
          return {
            reply: `${ghId} 云端记录夜间通风已开启（≥${stored.temp_high_c}°C 自动开帘），但暂无近期设备指令。`,
            params: { entity_id: ghId, mode: stored.mode },
          };
        }
        return {
          reply: `${ghId} 当前未开启夜间通风模式。`,
          params: { entity_id: ghId },
        };
      }
      return {
        reply: "最近没有可查询的指令记录。",
        params: {},
      };
    }

    if (actionFilter === "set_mode" && !ghId && records.length > 1) {
      return {
        reply: formatSetModeSummaryLines(records, formatServices),
        params: { count: records.length, action: "set_mode" },
      };
    }

    const record = records[0]!;
    return {
      reply: formatCommandStatusReply(record, formatServices),
      params: {
        command_id: record.command_id,
        status: record.status,
        device_id: record.command.device_id,
        action: record.command.action,
      },
    };
  }

  return { reply: "暂不支持该农业历史查询技能。", params: {} };
}
