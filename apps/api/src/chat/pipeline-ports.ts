import { createLogger } from "@embodied-agent/platform";
import type {
  ChatPipelineDeps,
  ChatPipelinePorts,
  RouteIntentResult,
} from "@embodied-agent/chat-runtime";
import { getEffectiveSettings } from "../settings/store.js";
import { getUserStrict } from "../auth/users.js";
import { USER_REPLY } from "./user-messages.js";
import { routeIntent } from "../skills/router.js";
import { type MqttCommandPublisher, type MqttContext } from "@embodied-agent/node";
import { resolveConfiguredMqttUrl } from "../mqtt/url.js";
import { getMetricsRegistry } from "../runtime/metrics-holder.js";
import { getIntentResolver } from "../runtime/agent-context.js";
import {
  clearPendingConfirm,
  getPendingConfirmForUser,
  listPendingConfirmsForConversation,
  listPendingConfirmsForUser,
  isCancelText,
  isConfirmText,
  refreshPendingConfirmsForUserFromRedis,
  reloadPendingConfirmFromFile,
} from "../policy/pending-confirm.js";
import { appendConversationTurns, getConversationHistoryForLlm } from "./conversation-store.js";
import {
  clearPendingClarification,
  getPendingClarification,
  refreshPendingClarificationFromRedis,
  setPendingClarification,
} from "../policy/pending-clarification.js";
import { sessionUsesRedis } from "../state/session-backing.js";
import { finishMergedIntent, tryMergePendingClarification } from "../policy/clarification-merge.js";
import { suppressL2ForTonight } from "../policy/notification-prefs.js";
import { isFlywheelDevBypass } from "../wechat/outbound.js";
import {
  buildCompoundDeploymentWeatherIntents,
  isCompoundDeploymentWeatherQuery,
} from "./compound-query.js";
import { renderCombinedQueryReply, renderReply } from "../nlg/render-reply.js";
import { buildActiveDomainAliasIndex } from "@embodied-agent/runtime";
import { getPlatformRuntimeContext } from "../runtime/context.js";
import { isUserCorrectionUtterance } from "@embodied-agent/agent";
import type { UserRole } from "@embodied-agent/safety";
import type { ClarificationPartial } from "../policy/pending-clarification.js";
import type { IntentPayload } from "@embodied-agent/core";

const log = createLogger("chat-pipeline");

const USER_ROLES = new Set<UserRole>(["owner", "operator", "worker", "viewer", "readonly"]);

function asUserRole(role: string): UserRole {
  if (!USER_ROLES.has(role as UserRole)) {
    throw new Error(`无效用户角色：${role}`);
  }
  return role as UserRole;
}

async function connectMqtt(
  deps: ChatPipelineDeps<MqttCommandPublisher>,
  mqttCtx: MqttContext | undefined,
): Promise<MqttCommandPublisher | undefined> {
  if (deps.mqttEnabled === false) return deps.mqtt;
  if (deps.mqtt) return deps.mqtt;
  if (!mqttCtx) {
    throw new Error("connectMqtt 需要 MqttContext：调用方未注入 mqttCtx。");
  }
  const url = resolveConfiguredMqttUrl(deps.mqttUrl);
  if (!url) {
    log.warn("mqtt_url 未配置，跳过 MQTT 连接；依赖 MQTT 的指令将失败可见");
    return undefined;
  }
  const mqtt = mqttCtx.publisher.get(url);
  try {
    await mqtt.connect();
    return mqtt;
  } catch (err) {
    log.warn("mqtt connect failed", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

/**
 * command 指标埋点：仅对产生 command 的路由结果记录。
 * - lifecycle completed/sent → success
 * - lifecycle failed → failed
 * - status 403（安全/设备目标拒绝）→ rejected
 * - 其余（澄清、非物理技能等）不记录 command 指标。
 */
function recordCommandMetric(skill: string, result: RouteIntentResult, startedAt: number): void {
  const registry = getMetricsRegistry();
  if (result.lifecycle_state === "completed" || result.lifecycle_state === "sent") {
    registry.incCommand(skill, "success");
  } else if (result.lifecycle_state === "failed") {
    registry.incCommand(skill, "failed");
  } else if (result.status === 403) {
    registry.incCommand(skill, "rejected");
  } else {
    return;
  }
  registry.observeCommandDuration(skill, (Date.now() - startedAt) / 1000);
}

export function createChatPipelinePorts(
  mqttCtx?: MqttContext,
): ChatPipelinePorts<MqttCommandPublisher> {
  const resolver = getIntentResolver();
  return {
    notBoundReply: USER_REPLY.notBound,
    getUserStrict,
    buildDeploymentContextCached: () => resolver.buildDeploymentContextCached(),
    sessionUsesRedis,
    refreshPendingConfirmsForUserFromRedis,
    refreshPendingClarificationFromRedis,
    isConfirmText,
    isCancelText,
    isFlywheelDevBypass,
    reloadPendingConfirmFromFile,
    listPendingConfirmsForConversation,
    getPendingConfirmForUser,
    listPendingConfirmsForUser,
    clearPendingConfirm,
    routeIntent: async (intent: IntentPayload, ctx) => {
      const startedAt = Date.now();
      const result: RouteIntentResult = await routeIntent(intent, {
        ...ctx,
        role: asUserRole(ctx.role),
      });
      recordCommandMetric(intent.skill, result, startedAt);
      return result;
    },
    normalizeUtterance: (text) => resolver.normalizeUtterance(text),
    isUserCorrectionUtterance,
    getPendingClarification,
    tryMergePendingClarification,
    buildActiveDomainAliasIndex: () => buildActiveDomainAliasIndex(getPlatformRuntimeContext()),
    suppressL2ForTonight,
    finishMergedIntent,
    clearPendingClarification,
    getConversationHistoryForLlm,
    isCompoundDeploymentWeatherQuery,
    buildCompoundDeploymentWeatherIntents,
    renderCombinedQueryReply,
    resolveWithEscalation: (text, deploymentContext, llm, opts) =>
      resolver.resolveWithEscalation(
        text,
        deploymentContext as Parameters<typeof resolver.resolveWithEscalation>[1],
        llm,
        opts,
      ),
    captureFailureCaseFromChat: (input) =>
      resolver.captureFailureCaseFromChat(
        input as Parameters<typeof resolver.captureFailureCaseFromChat>[0],
      ),
    setPendingClarification: (input) =>
      setPendingClarification({
        ...input,
        expected_skill: input.expected_skill as IntentPayload["skill"] | undefined,
        partial: input.partial as ClarificationPartial,
      }),
    renderReply,
    getDeploymentId: () => getEffectiveSettings().deployment_id,
    appendConversationTurns,
    connectMqtt: (deps) => connectMqtt(deps, mqttCtx),
    logInfo: (event, fields) => {
      log.info(event, fields);
    },
  };
}
