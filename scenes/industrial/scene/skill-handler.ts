import type {
  DomainPackSkillHandlerResult,
  IntentPayload,
  SceneTelemetrySlice,
} from "@embodied-agent/core";

type TelemetryServices = {
  getByEntityId?: (entityId: string) => SceneTelemetrySlice | undefined;
};

type CommandRecord = {
  command_id: string;
  status: string;
  command: {
    action: string;
    device_id: string;
    issued_by: { user_id: string };
  };
};

type CommandStatusServices = {
  get?: (commandId: string) => CommandRecord | undefined;
  findForUser?: (
    userId: string,
    opts?: { action?: string; entity_id?: string; limit?: number },
  ) => CommandRecord[];
};

function defaultCabinetId(domainConfig: unknown): string | undefined {
  const cfg = (domainConfig ?? {}) as { default_cabinet_id?: string };
  return cfg.default_cabinet_id?.trim() || undefined;
}

function cabinetId(intent: IntentPayload, domainConfig: unknown): string | undefined {
  const target = intent.target as { cabinet_id?: string };
  return target.cabinet_id?.trim() || defaultCabinetId(domainConfig);
}

function service<T>(context: { services?: Record<string, unknown> }, key: string): T {
  const value = context.services?.[key];
  return value && typeof value === "object" ? (value as T) : ({} as T);
}

function formatCommandStatus(record: CommandRecord): string {
  const action = record.command.action === "start" ? "启动排风" : "停止排风";
  return `${action}指令 ${record.command_id} 当前状态：${record.status}。`;
}

function mapAction(action?: string): string | undefined {
  if (!action) return undefined;
  if (action === "start_exhaust") return "start";
  if (action === "stop_exhaust") return "stop";
  return action;
}

export function canHandleIndustrialSkill(intent: IntentPayload): boolean {
  return intent.skill === "industrial.query_status" || intent.skill === "command.query_status";
}

export async function handleIndustrialSkill(
  intent: IntentPayload,
  context: {
    domainConfig?: unknown;
    deploymentId: string;
    userId?: string;
    services?: Record<string, unknown>;
  },
): Promise<DomainPackSkillHandlerResult> {
  if (intent.skill === "industrial.query_status") {
    const id = cabinetId(intent, context.domainConfig);
    if (!id) {
      return { reply: "未配置默认配电柜，无法查询工业现场状态。", params: {} };
    }
    const telemetry = service<TelemetryServices>(context, "telemetry");
    const row = telemetry.getByEntityId?.(id);
    if (!row) {
      return { reply: `未找到配电柜 ${id} 的遥测数据。`, params: { entity_id: id } };
    }
    const temperature = row.temperature_c;
    const exhaust = row.fan_status ?? row.exhaust_status ?? row.relay_state;
    const tempText = typeof temperature === "number" ? `${temperature.toFixed(1)}°C` : "无数据";
    const exhaustText =
      exhaust === "on" || exhaust === 1
        ? "运行"
        : exhaust === "off" || exhaust === 0
          ? "停止"
          : "无数据";
    return {
      reply: `${id} 当前温度 ${tempText}，排风 ${exhaustText}。`,
      params: { entity_id: id, temperature_c: temperature, exhaust_status: exhaustText },
    };
  }

  if (intent.skill === "command.query_status") {
    const userId = context.userId;
    if (!userId) return { reply: "无权查看该指令状态。", params: {} };
    const commands = service<CommandStatusServices>(context, "commands");
    const commandId = intent.parameters?.command_id;
    if (typeof commandId === "string" && commandId.trim()) {
      const record = commands.get?.(commandId);
      if (!record) return { reply: `未找到指令 ${commandId}。`, params: {} };
      if (record.command.issued_by.user_id !== userId) {
        return { reply: "无权查看该指令状态。", params: {} };
      }
      return {
        reply: formatCommandStatus(record),
        params: { command_id: record.command_id, status: record.status },
      };
    }
    const id = cabinetId(intent, context.domainConfig);
    const action = mapAction(intent.parameters?.action as string | undefined);
    const records = commands.findForUser?.(userId, { action, entity_id: id, limit: 1 }) ?? [];
    if (records.length === 0) {
      return { reply: "最近没有可查询的工业排风指令。", params: {} };
    }
    const record = records[0]!;
    return {
      reply: formatCommandStatus(record),
      params: { command_id: record.command_id, status: record.status },
    };
  }

  return { reply: "暂不支持该工业领域技能。", params: {} };
}
