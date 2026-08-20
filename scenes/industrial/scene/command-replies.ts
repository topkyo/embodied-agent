import type { IntentPayload } from "@embodied-agent/core";

export function industrialPhysicalCommandSentReply(
  skill: IntentPayload["skill"],
): string | undefined {
  if (skill === "industrial.start_exhaust") {
    return "排风指令已下发，正等待设备确认；若失败会通知您。";
  }
  if (skill === "industrial.stop_exhaust") {
    return "停止排风指令已下发，正等待设备确认；若失败会通知您。";
  }
  return undefined;
}

export function industrialPendingSummary(intent: IntentPayload): string | undefined {
  const params = intent.parameters as { duration_seconds?: number };
  if (intent.skill === "industrial.start_exhaust") {
    const cabinetId = (intent.target as Record<string, unknown>)?.cabinet_id;
    const cabinetLabel =
      typeof cabinetId === "string" && cabinetId.trim() ? cabinetId.trim() : "默认配电柜";
    return `${cabinetLabel} 排风 ${params.duration_seconds} 秒`;
  }
  if (intent.skill === "industrial.stop_exhaust") {
    const cabinetId = (intent.target as Record<string, unknown>)?.cabinet_id;
    const cabinetLabel =
      typeof cabinetId === "string" && cabinetId.trim() ? cabinetId.trim() : "默认配电柜";
    return `停止 ${cabinetLabel} 排风`;
  }
  return undefined;
}

/** 命令终态通知（与 agriculture / robotics 体验对齐）。 */
export function industrialCommandStatusMessage(record: unknown): string | null {
  const row = record as {
    status?: string;
    command?: { action?: string; device_id?: string };
    error?: { message?: string };
  };
  const device = row.command?.device_id ?? "排风设备";
  switch (row.status) {
    case "completed":
      return `${device} 排风指令已完成。`;
    case "rejected":
    case "failed":
      return `${device} 排风指令未执行：${row.error?.message ?? row.status}。`;
    case "timeout":
      return `${device} 排风指令超时：设备在约定时间内未确认。`;
    default:
      return null;
  }
}
