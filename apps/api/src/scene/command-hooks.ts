import type { CommandRecord } from "../commands/types.js";
import { getEffectiveSettings } from "../settings/store.js";
import { digestRecipientsForDeployment } from "../notifications/recipients.js";
import { proactiveWechatSendReady } from "../wechat/outbound.js";
import { defaultProactiveSend } from "../channels/proactive-send.js";
import { setPendingConfirm } from "../policy/pending-confirm.js";
import { loadRegistry } from "@embodied-agent/node";
import { activeCommandHooks } from "@embodied-agent/runtime";
import { createLogger } from "@embodied-agent/platform";
import { getPlatformRuntimeContext } from "../runtime/context.js";
import { evaluateSceneOutcomeFromCommand } from "./evaluate-outcome.js";
import { enqueueOutcomeWindows } from "./outcome-scheduler.js";
import { isSceneSkillId } from "./registry.js";
import { countRecentDeviceFailures, deviceEfficiencyNotifyKey } from "./device-failures.js";
import { isL2SuppressedForUser } from "../policy/notification-prefs.js";
import { appendOperationLog } from "../db/log.js";

const POST_IRRIGATION_DEDUP_MAX = 500;
const postIrrigationOrder: string[] = [];
const postIrrigationNotified = new Set<string>();
const postIrrigationInFlight = new Set<string>();
const DEVICE_EFFICIENCY_DEDUP_MAX = 500;
const deviceEfficiencyOrder: string[] = [];
const deviceEfficiencyNotified = new Set<string>();
const deviceEfficiencyInFlight = new Set<string>();

function logHookError(message: string, err: unknown): void {
  createLogger("command-hooks").error(message, {
    error: err instanceof Error ? err.message : String(err),
  });
}

function entityIdFromDevice(deployment_id: string, device_id: string): string | undefined {
  const reg = loadRegistry();
  return reg.devices.find((d) => d.deployment_id === deployment_id && d.device_id === device_id)
    ?.entity_id;
}

function requireEntityIdForDevice(deployment_id: string, device_id: string): string {
  const entityId = entityIdFromDevice(deployment_id, device_id);
  if (!entityId) {
    throw new Error(`device 未绑定 entity_id：${deployment_id}/${device_id}`);
  }
  return entityId;
}

function markDeviceEfficiencyNotified(key: string): void {
  if (deviceEfficiencyNotified.has(key)) return;
  deviceEfficiencyNotified.add(key);
  deviceEfficiencyOrder.push(key);
  while (deviceEfficiencyOrder.length > DEVICE_EFFICIENCY_DEDUP_MAX) {
    const evicted = deviceEfficiencyOrder.shift();
    if (evicted) deviceEfficiencyNotified.delete(evicted);
  }
}

function markPostIrrigationNotified(command_id: string): void {
  if (postIrrigationNotified.has(command_id)) return;
  postIrrigationNotified.add(command_id);
  postIrrigationOrder.push(command_id);
  while (postIrrigationOrder.length > POST_IRRIGATION_DEDUP_MAX) {
    const evicted = postIrrigationOrder.shift();
    if (evicted) postIrrigationNotified.delete(evicted);
  }
}

export function onCommandTerminalEvent(record: CommandRecord): void {
  if (record.status === "completed") {
    evaluateSceneOutcomeFromCommand(record);
    if (record.scene_skill_id && isSceneSkillId(record.scene_skill_id)) {
      const entityId = requireEntityIdForDevice(
        record.command.deployment_id,
        record.command.device_id,
      );
      enqueueOutcomeWindows(record.command_id, record.command.deployment_id, entityId);
    }
    void maybeNotifyCompletedCommandPlan(record).catch((err) => {
      logHookError("completed-command-plan hook failed", err);
    });
    return;
  }
  if (record.status === "rejected" || record.status === "failed" || record.status === "timeout") {
    void maybeNotifyDeviceFailurePlan(record).catch((err) => {
      logHookError("device-failure-plan hook failed", err);
    });
  }
}

async function maybeNotifyCompletedCommandPlan(record: CommandRecord): Promise<void> {
  const cmd = record.command;
  const runtime = activeCommandHooks(getPlatformRuntimeContext());
  if (!runtime) return;
  if (postIrrigationNotified.has(record.command_id)) return;
  if (postIrrigationInFlight.has(record.command_id)) return;
  postIrrigationInFlight.add(record.command_id);

  try {
    const settings = getEffectiveSettings();
    if (settings.alert_push_enabled === false) return;
    if (!proactiveWechatSendReady()) return;

    const plan = runtime.buildCompletedCommandPlan({
      command: cmd,
      entityId: entityIdFromDevice(cmd.deployment_id, cmd.device_id),
    });
    if (!plan) return;

    const recipients = digestRecipientsForDeployment(cmd.deployment_id);
    if (recipients.length === 0) return;

    const now = Date.now();
    let anySent = false;
    for (const r of recipients) {
      if (isL2SuppressedForUser(r.principal_user_id, now)) continue;
      const sent = await defaultProactiveSend(r.platform_user_id, plan.templateText);
      if (!sent) continue;
      anySent = true;
      setPendingConfirm({
        intent: plan.intent,
        user_id: r.principal_user_id,
        conversation_id: r.platform_user_id,
        model: settings.llm_model,
        scene_skill_id: plan.sceneSkillId,
      });
    }
    if (anySent) markPostIrrigationNotified(record.command_id);
  } finally {
    postIrrigationInFlight.delete(record.command_id);
  }
}

async function maybeNotifyDeviceFailurePlan(record: CommandRecord): Promise<void> {
  const settings = getEffectiveSettings();
  if (settings.alert_push_enabled === false) return;
  if (!proactiveWechatSendReady()) return;

  const { deployment_id } = record.command;
  const { device_id } = record.command;
  const key = deviceEfficiencyNotifyKey(deployment_id, device_id);
  if (deviceEfficiencyNotified.has(key)) return;
  if (deviceEfficiencyInFlight.has(key)) return;

  const failureCount = countRecentDeviceFailures(device_id, deployment_id);
  const runtime = activeCommandHooks(getPlatformRuntimeContext());
  if (!runtime) return;
  // 场景调参下沉 pack：pack 决定失败通知阈值，host 负责计数与去重。
  if (
    !runtime.shouldNotifyDeviceFailure?.({
      deviceId: device_id,
      deploymentId: deployment_id,
      failureCount,
    })
  )
    return;

  deviceEfficiencyInFlight.add(key);
  try {
    const plan = runtime.buildDeviceFailurePlan({
      deviceId: device_id,
      entityId: entityIdFromDevice(deployment_id, device_id),
      failureCount,
    });
    if (!plan) return;

    const recipients = digestRecipientsForDeployment(deployment_id);
    let anySent = false;
    for (const r of recipients) {
      const sent = await defaultProactiveSend(r.platform_user_id, plan.templateText);
      if (sent) anySent = true;
    }
    if (anySent) {
      markDeviceEfficiencyNotified(key);
      const recipient = recipients[0];
      if (recipient) {
        appendOperationLog({
          user_id: recipient.principal_user_id,
          skill: "alert.query_today",
          intent_source: "llm",
          model: settings.llm_model,
          params: {
            device_id,
            deployment_id,
            scene_skill_id: plan.sceneSkillId,
            failure_count: failureCount,
          },
          result: "sent",
          message: plan.templateText,
        });
      }
    }
  } finally {
    deviceEfficiencyInFlight.delete(key);
  }
}

/** 飞轮 reset-state 与单测：清空内存去重，允许多轮联调重复触发灌后通风/设备诊断。 */
export function clearCommandHooksFlywheelDedup(): void {
  postIrrigationNotified.clear();
  postIrrigationOrder.length = 0;
  postIrrigationInFlight.clear();
  deviceEfficiencyNotified.clear();
  deviceEfficiencyOrder.length = 0;
  deviceEfficiencyInFlight.clear();
}

/** @internal tests */
export function clearCommandHooksStateForTests(): void {
  clearCommandHooksFlywheelDedup();
}
