import { listBindings } from "../auth/platform-bind.js";
import { domainCommandStatusMessage } from "@embodied-agent/runtime";
import { defaultProactiveSend } from "../channels/proactive-send.js";
import { markCommandNotified } from "./store.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";
import type { CommandLifecycleStatus, CommandRecord } from "./types.js";

/** 微信主动推送仅终态；running 与对话内「已提交」重复且易与模拟加速混淆 */
const NOTIFY_STATUSES = new Set<CommandLifecycleStatus>([
  "completed",
  "rejected",
  "failed",
  "timeout",
]);

export function formatDurationZh(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) {
    const m = seconds / 60;
    return `${m} 分钟`;
  }
  return `${seconds} 秒`;
}

/** 计划时长远超实际上报时，说明本地模拟器 SIM_MAX_COMMAND_MS 加速 */
export function simAccelerationSuffix(plannedSeconds?: number, actualSeconds?: number): string {
  if (!plannedSeconds || !actualSeconds || plannedSeconds <= actualSeconds + 2) {
    return "";
  }
  if (plannedSeconds > actualSeconds * 2) {
    return `（本地模拟加速：目标 ${formatDurationZh(plannedSeconds)}，演示约 ${actualSeconds} 秒；真实节点将按目标时长运行）`;
  }
  return "";
}

export function resolveCompletedDurationSeconds(record: CommandRecord): number | undefined {
  const fromResult = record.result?.actual_duration_seconds;
  if (typeof fromResult === "number" && fromResult > 0) return fromResult;
  return undefined;
}

function resolveWechatPlatformUserId(record: CommandRecord): string | null {
  const { user_id, platform } = record.command.issued_by;
  if (platform !== "wechat") return null;
  const byPrincipalUser = listBindings().find(
    (b) => b.platform === "wechat" && b.principal_user_id === user_id,
  );
  if (byPrincipalUser) return byPrincipalUser.platform_user_id;
  return null;
}

export function buildCommandStatusMessage(record: CommandRecord): string | null {
  return domainCommandStatusMessage(getPlatformRuntimeContext(), record);
}

export async function notifyCommandStatusChange(
  record: CommandRecord,
  send = defaultProactiveSend,
): Promise<boolean> {
  if (!NOTIFY_STATUSES.has(record.status)) return false;
  if (record.notified_status === record.status) return false;

  const platformUserId = resolveWechatPlatformUserId(record);
  if (!platformUserId) return false;

  const message = buildCommandStatusMessage(record);
  if (!message) return false;

  const sent = await send(platformUserId, message);
  // 先发后标记：send 成功但 mark 写盘失败时，下一轮会重发——at-least-once 有意为之；
  // 收敛端（微信用户）容忍重复通知，不做 exactly-once。
  if (sent) markCommandNotified(record.command_id, record.status, record.command.deployment_id);
  return sent;
}
