import type { GreenhouseCommandFormatServices, GreenhouseCommandRecord } from "./command-status.js";
import { formatGreenhouseLabel } from "./labels.js";

export function formatDurationZh(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} 分钟`;
  }
  return `${seconds} 秒`;
}

export function simAccelerationSuffix(plannedSeconds?: number, actualSeconds?: number): string {
  if (!plannedSeconds || !actualSeconds || plannedSeconds <= actualSeconds + 2) {
    return "";
  }
  if (plannedSeconds > actualSeconds * 2) {
    return `（本地模拟加速：目标 ${formatDurationZh(plannedSeconds)}，演示约 ${actualSeconds} 秒；真实节点将按目标时长运行）`;
  }
  return "";
}

export function resolveCompletedDurationSeconds(
  record: GreenhouseCommandRecord,
): number | undefined {
  const fromResult = record.result?.actual_duration_seconds;
  if (typeof fromResult === "number" && fromResult > 0) return fromResult;
  return undefined;
}

function deviceDisplayLabel(deviceId: string, services: GreenhouseCommandFormatServices): string {
  const entityId = services.entityIdFromDeviceId?.(deviceId);
  return entityId ? formatGreenhouseLabel(entityId) : deviceId;
}

function formatConfigVersionMismatchDetail(message?: string, code?: string): string {
  if (code !== "config_version_mismatch") return message ?? "配置版本不一致";
  const match = message?.match(/expected\s+(\d+)/i);
  if (match) return `节点当前配置版本为 ${match[1]}，与云端不一致`;
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

function formatSetModeNotify(
  record: GreenhouseCommandRecord,
  device: string,
  status: string,
): string | null {
  const mode = record.command.parameters?.mode;
  const high =
    record.command.parameters?.max_temp_c ?? record.command.parameters?.temp_high_c ?? 30;
  if (status === "running" || status === "acknowledged") {
    return mode === "off"
      ? `${device} 正在关闭夜间通风模式…`
      : `${device} 正在启用夜间通风模式（≥${high}°C 自动开帘）…`;
  }
  if (status === "completed") {
    return mode === "off"
      ? `${device} 夜间通风模式已关闭。`
      : `${device} 夜间通风模式已开启（≥${high}°C 自动开帘）。`;
  }
  if (status === "rejected" || status === "failed") {
    const detail = formatCommandRejectionDetail(record.error, status);
    return `${device} 夜间通风模式未生效：${detail}`;
  }
  if (status === "timeout") {
    return `${device} 夜间通风指令超时：设备未在约定时间内确认，请检查节点在线状态。`;
  }
  return null;
}

export function buildGreenhouseCommandStatusMessage(
  record: GreenhouseCommandRecord,
  services: GreenhouseCommandFormatServices = {},
): string | null {
  const cmd = record.command;
  const action = cmd.action;

  if (action === "set_mode") {
    return formatSetModeNotify(record, cmd.device_id, record.status);
  }

  const label = deviceDisplayLabel(cmd.device_id, services);
  const planned =
    typeof cmd.parameters?.duration_seconds === "number"
      ? cmd.parameters.duration_seconds
      : undefined;

  switch (record.status) {
    case "running": {
      if (action === "open") {
        return planned
          ? `${label} 侧帘已开始打开（目标 ${formatDurationZh(planned)}）。`
          : `${label} 侧帘已开始打开。`;
      }
      if (action === "close") {
        return planned
          ? `${label} 侧帘已开始关闭（目标 ${formatDurationZh(planned)}）。`
          : `${label} 侧帘已开始关闭。`;
      }
      if (action === "start") {
        return `${label} 风机已启动。`;
      }
      return `${label} 指令 ${action} 已开始执行。`;
    }
    case "completed": {
      const actual = resolveCompletedDurationSeconds(record);
      const simNote = simAccelerationSuffix(planned, actual);
      if (action === "open" || action === "close") {
        if (simNote) {
          return `${label} 通风指令已执行${simNote}`;
        }
        return actual
          ? `${label} 通风动作已完成，用时约 ${formatDurationZh(actual)}。`
          : `${label} 通风动作已完成。`;
      }
      if (action === "start" && actual) {
        const fanNote = simAccelerationSuffix(planned, actual);
        return fanNote
          ? `${label} 风机指令已执行${fanNote}`
          : `${label} 风机运行已完成，用时约 ${formatDurationZh(actual)}。`;
      }
      return `${label} 指令 ${action} 已完成。`;
    }
    case "rejected":
    case "failed":
      return `${label} 指令未执行：${formatCommandRejectionDetail(record.error, record.status)}`;
    case "timeout":
      return `${label} 指令超时：设备在约定时间内未确认，请检查节点在线状态。`;
    default:
      return null;
  }
}
