import type { SceneModeState } from "@embodied-agent/core";
import { formatGreenhouseLabel } from "./labels.js";

export type GreenhouseCommandRecord = {
  command_id: string;
  status: string;
  command: {
    device_id: string;
    action: string;
    parameters?: Record<string, unknown>;
    issued_by: { user_id: string };
    [key: string]: unknown;
  };
  error?: {
    code?: string;
    message?: string;
  };
  result?: Record<string, unknown>;
};

export type GreenhouseCommandFormatServices = {
  entityIdFromDeviceId?: (deviceId: string) => string | undefined;
  getModeByEntityId?: (entityId: string) => SceneModeState | undefined | null;
};

const STATUS_LABEL: Record<string, string> = {
  created: "已创建，等待下发",
  sent: "已提交，等待设备确认",
  acknowledged: "设备已确认",
  running: "设备执行中",
  completed: "已完成",
  rejected: "设备拒绝",
  failed: "执行失败",
  timeout: "超时未响应",
};

const ACTION_LABEL: Record<string, string> = {
  open: "开侧帘",
  close: "关侧帘",
  stop: "停通风",
  start: "开风机",
  set_mode: "环控模式",
};

export function mapQueryActionToStored(action?: string): string | undefined {
  if (!action) return undefined;
  if (action === "open_vent") return "open";
  if (action === "close_vent") return "close";
  return action;
}

function deviceEntityId(
  deviceId: string,
  services: GreenhouseCommandFormatServices,
): string | undefined {
  return services.entityIdFromDeviceId?.(deviceId);
}

function deviceLabel(deviceId: string, services: GreenhouseCommandFormatServices): string {
  const entityId = deviceEntityId(deviceId, services);
  return entityId ? formatGreenhouseLabel(entityId) : deviceId;
}

function formatDurationZh(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} 小时`;
  if (seconds % 60 === 0) return `${seconds / 60} 分钟`;
  return `${seconds} 秒`;
}

function formatConfigVersionMismatchDetail(message?: string, code?: string): string {
  if (code !== "config_version_mismatch") return message ?? "配置版本不一致";
  const m = message?.match(/expected\s+(\d+)/i);
  if (m) return `节点当前配置版本为 ${m[1]}，与云端不一致`;
  return "节点配置版本与云端不一致";
}

function formatCommandRejectionDetail(
  error?: { code?: string; message?: string },
  fallback = "执行失败",
): string {
  const detail = formatConfigVersionMismatchDetail(error?.message ?? fallback, error?.code);
  const hint =
    error?.code === "config_version_mismatch"
      ? " 请在配置台重新绑定节点或递增 config 版本后重试。"
      : "";
  return `${detail}${hint}`;
}

function formatSetModeReply(
  record: GreenhouseCommandRecord,
  services: GreenhouseCommandFormatServices,
): string {
  const gh = deviceLabel(record.command.device_id, services);
  const mode = record.command.parameters?.mode;
  const high =
    record.command.parameters?.max_temp_c ?? record.command.parameters?.temp_high_c ?? 30;
  const label = STATUS_LABEL[record.status] ?? record.status;

  if (record.status === "completed") {
    if (mode === "off") {
      return `${gh} 夜间通风模式已关闭。`;
    }
    const entityId = deviceEntityId(record.command.device_id, services) ?? record.command.device_id;
    const stored = services.getModeByEntityId?.(entityId);
    const activeHigh = stored?.temp_high_c ?? high;
    return `${gh} 夜间通风模式已开启（≥${activeHigh}°C 自动开帘）。`;
  }

  if (record.status === "rejected" || record.status === "failed") {
    const detail = formatCommandRejectionDetail(record.error, label);
    return `${gh} 夜间通风模式未生效：${detail}`;
  }

  if (record.status === "sent" || record.status === "acknowledged") {
    return mode === "off"
      ? `${gh} 正在关闭夜间通风模式（${label}）。`
      : `${gh} 夜间通风模式指令${label}（≥${high}°C 自动开帘）。`;
  }

  if (mode === "off") {
    return `${gh} 关闭夜间模式：${label}。`;
  }
  return `${gh} 夜间通风模式：${label}（≥${high}°C 自动开帘）。`;
}

function formatVentActionReply(
  record: GreenhouseCommandRecord,
  services: GreenhouseCommandFormatServices,
): string {
  const cmd = record.command;
  const gh = deviceLabel(cmd.device_id, services);
  const action = cmd.action;
  const label = STATUS_LABEL[record.status] ?? record.status;
  const actionZh = ACTION_LABEL[action] ?? action;
  const planned =
    typeof cmd.parameters?.duration_seconds === "number"
      ? cmd.parameters.duration_seconds
      : undefined;

  if (record.status === "completed") {
    const fromResult = record.result?.actual_duration_seconds;
    const actual = typeof fromResult === "number" && fromResult > 0 ? fromResult : undefined;
    if (action === "open" && actual) {
      return `${gh} 侧帘已开满 ${formatDurationZh(actual)}。`;
    }
    if (action === "close" && actual) {
      return `${gh} 关侧帘已完成（${formatDurationZh(actual)}）。`;
    }
    if (action === "stop") {
      return `${gh} 通风已停止。`;
    }
    if (action === "start" && actual) {
      return `${gh} 风机已运行 ${formatDurationZh(actual)}。`;
    }
    return `${gh} ${actionZh}：${label}。`;
  }

  if (record.status === "rejected" || record.status === "failed") {
    const detail = formatCommandRejectionDetail(record.error, label);
    return `${gh} ${actionZh}未成功：${detail}`;
  }

  if (record.status === "running" || record.status === "acknowledged") {
    const dur = planned ? `（计划 ${formatDurationZh(planned)}）` : "";
    return `${gh} 正在${actionZh}${dur}，${label}。`;
  }

  const dur = planned ? `，计划 ${formatDurationZh(planned)}` : "";
  return `${gh} ${actionZh}${dur}：${label}。`;
}

export function formatCommandStatusReply(
  record: GreenhouseCommandRecord,
  services: GreenhouseCommandFormatServices = {},
): string {
  const cmd = record.command;
  if (cmd.action === "set_mode") {
    return formatSetModeReply(record, services);
  }
  return formatVentActionReply(record, services);
}

export function formatSetModeSummaryLines(
  records: GreenhouseCommandRecord[],
  services: GreenhouseCommandFormatServices = {},
): string {
  const byGh = new Map<string, GreenhouseCommandRecord>();
  for (const r of records) {
    if (r.command.action !== "set_mode") continue;
    const gh = deviceLabel(r.command.device_id, services);
    if (!byGh.has(gh)) byGh.set(gh, r);
  }
  if (byGh.size === 0) {
    return "最近没有夜间通风相关的指令记录。";
  }
  return [...byGh.values()].map((r) => formatSetModeReply(r, services)).join("\n");
}
