import { resolve } from "node:path";
import type { CommandEvent, CommandMessage, IntentPayload } from "@embodied-agent/core";
import type { SafetyDecision } from "@embodied-agent/safety";
import type { CommandRecord } from "../../commands/types.js";
import { publishPreparedCommand } from "../../commands/publish-prepared.js";
import { captureTelemetrySnapshot } from "../../commands/telemetry-snapshot.js";
import {
  applyCommandEvent,
  createCommand,
  getInFlightCommandForDevice,
  markCommandExecutionSource,
  markCommandFailed,
  markCommandSent,
} from "../../commands/store.js";
import { appendOperationLog } from "../../db/log.js";
import { buildIntentAuditParams } from "../../db/intent-audit-params.js";
import { ROUTER_CONFIG_WAIT_MS } from "@embodied-agent/node";
import { withFileLock, FileLockBusyError } from "../../fs/file-lock.js";
import { dataRoot } from "../../fs/deployment-path.js";
import { riskLevelForPhysicalSkill, riskLevelForScene } from "../../scene/risk-level.js";
import {
  domainPhysicalFailureCode,
  executeDomainPhysicalCommand,
  type SceneResolvedDeviceTarget,
} from "@embodied-agent/runtime";
import { assertDispatchableTarget } from "@embodied-agent/runtime";
import type { RouteContext } from "../route-context.js";
import { getPlatformRuntimeContext } from "../../runtime/context.js";
import { physicalCommandSentReply } from "./command-replies.js";
import { resolveSceneForRoute } from "./scene-for-route.js";

/** 构造 in-flight 拒绝响应（409）并记录操作日志。existing 为空时（锁忙竞态）用通用文案。 */
function rejectInFlight(
  existing: CommandRecord | undefined,
  intent: IntentPayload,
  ctx: RouteContext,
  cmd: CommandMessage,
): { reply: string; status: 409; params: Record<string, unknown> } {
  const sameAction = existing ? existing.command.action === cmd.action : false;
  const reply = existing
    ? sameAction
      ? "设备正在执行相同指令，无需重复下发。"
      : `设备正在执行指令（${existing.command.action}），请等待完成后再下发。`
    : "设备正在执行指令，请等待完成后再下发。";
  const params: Record<string, unknown> = {
    ...buildIntentAuditParams(intent),
    code: "device_command_in_flight",
    device_id: cmd.device_id,
    ...(cmd.entity_id ? { entity_id: cmd.entity_id } : {}),
    action: cmd.action,
    ...(existing
      ? sameAction
        ? { existing_command_id: existing.command_id }
        : { in_flight_action: existing.command.action }
      : {}),
  };
  appendOperationLog({
    user_id: ctx.user_id,
    skill: intent.skill,
    intent_source: "llm",
    model: ctx.model,
    params,
    result: "rejected",
    message: reply,
  });
  return { reply, status: 409, params };
}

export async function publishPhysicalCommand(opts: {
  intent: IntentPayload;
  ctx: RouteContext;
  target: SceneResolvedDeviceTarget;
  device?: { manual_override?: boolean };
  safety: SafetyDecision;
  cmd: CommandMessage;
}): Promise<{
  reply: string;
  status: number;
  command_id?: string;
  execution_transport?: string;
  lifecycle_state?: "created" | "sent" | "completed" | "failed";
  params?: Record<string, unknown>;
}> {
  const { intent, ctx, target, device, safety, cmd } = opts;
  const platformCtx = getPlatformRuntimeContext();
  const dispatchable = assertDispatchableTarget(platformCtx, target);
  if (!dispatchable.ok) {
    appendOperationLog({
      user_id: ctx.user_id,
      skill: intent.skill,
      intent_source: "llm",
      model: ctx.model,
      params: {
        ...buildIntentAuditParams(intent),
        deployment_id: target.deployment_id,
        node_id: target.node_id,
        device_id: target.device.device_id,
        ...(target.device.entity_id ? { entity_id: target.device.entity_id } : {}),
        code: dispatchable.code,
      },
      result: "failed",
      message: dispatchable.reason,
    });
    return { reply: dispatchable.reason, status: dispatchable.status };
  }

  const beforeSnap = cmd.entity_id
    ? captureTelemetrySnapshot(cmd.entity_id, cmd.deployment_id)
    : undefined;
  const scene_skill_id = resolveSceneForRoute(intent, ctx, device);
  const risk_level = scene_skill_id
    ? riskLevelForScene(platformCtx, scene_skill_id)
    : riskLevelForPhysicalSkill(platformCtx, intent.skill, {
        requires_confirmation: safety.requires_confirmation,
      });

  // 并发控制：per-device lock 保护"查询 in-flight + createCommand"临界区。
  // publish / domain executor（IO）在锁外，不阻塞其他设备。
  // 锁文件归入 AGENT_DATA_DIR，避免按进程 cwd 落盘导致多实例互斥失效。
  const lockKey = resolve(
    dataRoot(),
    "locks",
    "device-command",
    `${cmd.deployment_id}:${cmd.device_id}.lock`,
  );
  let inflightBlocked: CommandRecord | undefined;
  try {
    inflightBlocked = await withFileLock(lockKey, () => {
      const existing = getInFlightCommandForDevice({
        deploymentId: cmd.deployment_id,
        deviceId: cmd.device_id,
      });
      if (existing) {
        return existing;
      }
      createCommand(cmd, {
        telemetry_before: beforeSnap,
        scene_skill_id,
        risk_level,
        user_confirmed: ctx.skip_confirmation ? true : ctx.user_confirmed,
      });
      return undefined;
    });
  } catch (e) {
    if (e instanceof FileLockBusyError) {
      // 同设备临界区正被另一个下发占用：拒绝并提示已有指令在途。
      const existing = getInFlightCommandForDevice({
        deploymentId: cmd.deployment_id,
        deviceId: cmd.device_id,
      });
      return rejectInFlight(existing, intent, ctx, cmd);
    }
    throw e;
  }

  if (inflightBlocked) {
    return rejectInFlight(inflightBlocked, intent, ctx, cmd);
  }

  try {
    const domainExecution = await executeDomainPhysicalCommand(platformCtx, intent, target);
    if (domainExecution.handled) {
      markCommandExecutionSource(
        cmd.command_id,
        {
          execution_transport: String(target.transport ?? "domain_executor"),
          lifecycle_source: "api_domain_executor",
        },
        cmd.deployment_id,
      );
      markCommandSent(cmd.command_id, cmd.deployment_id);
      const event: CommandEvent = {
        message_type: "command_event",
        protocol_version: "0.1",
        event_id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        command_id: cmd.command_id,
        idempotency_key: cmd.idempotency_key,
        deployment_id: cmd.deployment_id,
        node_id: cmd.node_id,
        device_id: cmd.device_id,
        status: "completed",
        result:
          domainExecution.result && typeof domainExecution.result === "object"
            ? (domainExecution.result as Record<string, unknown>)
            : { value: domainExecution.result },
        occurred_at: new Date().toISOString(),
      };
      applyCommandEvent(event);
      const reply = physicalCommandSentReply(intent.skill);
      appendOperationLog({
        user_id: ctx.user_id,
        skill: intent.skill,
        intent_source: "llm",
        model: ctx.model,
        params: {
          ...buildIntentAuditParams(intent),
          command_id: cmd.command_id,
          device_id: cmd.device_id,
          ...(cmd.entity_id ? { entity_id: cmd.entity_id } : {}),
          action: cmd.action,
          ...(scene_skill_id ? { scene_skill_id } : {}),
          ...(risk_level ? { risk_level } : {}),
          execution_path: "domain_physical_executor",
          event_source: "api_domain_executor",
          ...domainExecution.logFields,
        },
        result: "completed",
        message: reply,
      });
      return {
        reply,
        status: 200,
        command_id: cmd.command_id,
        execution_transport: String(target.transport ?? "domain_executor"),
        lifecycle_state: "completed",
      };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    markCommandExecutionSource(
      cmd.command_id,
      {
        execution_transport: String(target.transport ?? "domain_executor"),
        lifecycle_source: "api_domain_executor",
      },
      cmd.deployment_id,
    );
    markCommandFailed(
      cmd.command_id,
      { code: domainPhysicalFailureCode(platformCtx, target), message },
      cmd.deployment_id,
    );
    appendOperationLog({
      user_id: ctx.user_id,
      skill: intent.skill,
      intent_source: "llm",
      model: ctx.model,
      params: {
        ...buildIntentAuditParams(intent),
        intent_id: cmd.intent_id,
        command_id: cmd.command_id,
        device_id: cmd.device_id,
        ...(cmd.entity_id ? { entity_id: cmd.entity_id } : {}),
        execution_path: "domain_physical_executor",
        event_source: "api_domain_executor",
        transport: target.transport ?? "domain_executor",
      },
      result: "failed",
      message,
    });
    return { reply: "指令执行失败，请稍后重试或联系运维。", status: 503 };
  }

  if (!ctx.mqtt) {
    markCommandExecutionSource(
      cmd.command_id,
      { execution_transport: "mqtt", lifecycle_source: "scene_node_mqtt" },
      cmd.deployment_id,
    );
    markCommandFailed(
      cmd.command_id,
      {
        code: "mqtt_unavailable",
        message: "MQTT 未连接",
      },
      cmd.deployment_id,
    );
    appendOperationLog({
      user_id: ctx.user_id,
      skill: intent.skill,
      intent_source: "llm",
      model: ctx.model,
      params: {
        ...buildIntentAuditParams(intent),
        intent_id: cmd.intent_id,
        command_id: cmd.command_id,
        device_id: cmd.device_id,
        ...(cmd.entity_id ? { entity_id: cmd.entity_id } : {}),
        execution_path: "mqtt_scene_node",
        event_source: "scene_node_mqtt",
      },
      result: "failed",
      message: "设备链路不可用 / MQTT 未连接",
    });
    return { reply: "设备链路不可用，指令未下发。", status: 503 };
  }

  const published = await publishPreparedCommand({
    command: cmd,
    commandId: cmd.command_id,
    deploymentId: cmd.deployment_id,
    mqtt: ctx.mqtt,
    waitMs: ROUTER_CONFIG_WAIT_MS,
  });
  if (!published.ok) {
    markCommandExecutionSource(
      cmd.command_id,
      { execution_transport: "mqtt", lifecycle_source: "scene_node_mqtt" },
      cmd.deployment_id,
    );
    appendOperationLog({
      user_id: ctx.user_id,
      skill: intent.skill,
      intent_source: "llm",
      model: ctx.model,
      params: {
        ...buildIntentAuditParams(intent),
        intent_id: cmd.intent_id,
        command_id: cmd.command_id,
        device_id: cmd.device_id,
        ...(cmd.entity_id ? { entity_id: cmd.entity_id } : {}),
        execution_path: "mqtt_scene_node",
        event_source: "scene_node_mqtt",
      },
      result: "failed",
      message: published.message,
    });
    return { reply: "指令下发失败，设备可能离线，请稍后重试。", status: 503 };
  }

  const reply = physicalCommandSentReply(intent.skill);
  markCommandExecutionSource(
    cmd.command_id,
    { execution_transport: "mqtt", lifecycle_source: "scene_node_mqtt" },
    cmd.deployment_id,
  );
  appendOperationLog({
    user_id: ctx.user_id,
    skill: intent.skill,
    intent_source: "llm",
    model: ctx.model,
    params: {
      ...buildIntentAuditParams(intent),
      intent_id: cmd.intent_id,
      command_id: cmd.command_id,
      device_id: cmd.device_id,
      ...(cmd.entity_id ? { entity_id: cmd.entity_id } : {}),
      action: cmd.action,
      ...(scene_skill_id ? { scene_skill_id } : {}),
      ...(risk_level ? { risk_level } : {}),
      execution_path: "mqtt_scene_node",
      event_source: "scene_node_mqtt",
    },
    result: "sent",
    message: reply,
  });
  return {
    reply,
    status: 200,
    command_id: cmd.command_id,
    execution_transport: "mqtt",
    lifecycle_state: "sent",
  };
}
