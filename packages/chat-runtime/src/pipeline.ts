import type {
  ChatPipelineDeps,
  ChatPipelinePorts,
  ChatPipelineResult,
  ChatUserRecord,
  NormalizedChatMessage,
  PendingConfirmRecord,
} from "./types.js";
import type { IntentPayload } from "@embodied-agent/core";
import type { LlmChatTurn } from "@embodied-agent/agent";

const ambiguousPendingHint =
  "您有多个待确认操作，请通过对应通知进入后回复「确认」，或说明要执行哪一项。";

type FinishExtras = {
  command_id?: string;
  execution_transport?: string;
  lifecycle_state?: "created" | "sent" | "completed" | "failed";
  params?: Record<string, unknown>;
};

/** 阶段结果：继续 / 早退（带最终结果）/ 路由（带最终结果）。 */
export type StageResult =
  | { kind: "continue" }
  | { kind: "early_return"; result: ChatPipelineResult }
  | { kind: "route"; result: ChatPipelineResult };

/** 各阶段共享的上下文：依赖、状态与显式参数化的 helper。 */
export type PipelineContext<TMqtt = unknown> = {
  msg: NormalizedChatMessage;
  deps: ChatPipelineDeps<TMqtt>;
  ports: ChatPipelinePorts<TMqtt>;
  user: ChatUserRecord;
  deploymentContext: unknown;
  normalizedText: string;
  history: readonly LlmChatTurn[];
  forcePro: boolean;
  resolvedIntent: IntentPayload | undefined;
  finish: (
    reply: string,
    status: number,
    record?: boolean,
    extras?: FinishExtras,
  ) => ChatPipelineResult;
  resolvePendingConfirm: () => Promise<PendingConfirmRecord | "ambiguous" | undefined>;
  emitStage: (stage: "received" | "stt", detail: string) => void;
};

function recordExchange<TMqtt>(
  ports: ChatPipelinePorts<TMqtt>,
  msg: NormalizedChatMessage,
  reply: string,
): void {
  ports.appendConversationTurns(msg.user_id, msg.conversation_id, [
    { role: "user", content: msg.text },
    { role: "assistant", content: reply },
  ]);
}

function finish<TMqtt>(
  ports: ChatPipelinePorts<TMqtt>,
  msg: NormalizedChatMessage,
  reply: string,
  status: number,
  record = true,
  extras: FinishExtras = {},
): ChatPipelineResult {
  if (record) recordExchange(ports, msg, reply);
  return {
    reply,
    status,
    ...(extras.command_id ? { command_id: extras.command_id } : {}),
    ...(extras.execution_transport ? { execution_transport: extras.execution_transport } : {}),
    ...(extras.lifecycle_state ? { lifecycle_state: extras.lifecycle_state } : {}),
    ...(extras.params ? { params: extras.params } : {}),
  };
}

async function resolvePendingConfirm<TMqtt>(
  ports: ChatPipelinePorts<TMqtt>,
  msg: NormalizedChatMessage,
): Promise<PendingConfirmRecord | "ambiguous" | undefined> {
  const convRows = ports.listPendingConfirmsForConversation(msg.user_id, msg.conversation_id);
  if (convRows.length > 1) return "ambiguous";
  if (convRows.length === 1) return convRows[0];
  const pending = ports.getPendingConfirmForUser(msg.user_id);
  if (!pending && ports.listPendingConfirmsForUser(msg.user_id).length > 1) {
    return "ambiguous";
  }
  return pending;
}

/** 构建阶段上下文；用户未绑定返回 null（由主函数处理早退）。 */
function buildPipelineContext<TMqtt>(
  msg: NormalizedChatMessage,
  deps: ChatPipelineDeps<TMqtt>,
  ports: ChatPipelinePorts<TMqtt>,
): PipelineContext<TMqtt> | null {
  const strictUser = ports.getUserStrict(msg.user_id);
  if (!strictUser) return null;
  return {
    msg,
    deps,
    ports,
    user: strictUser,
    deploymentContext: deps.deploymentContext,
    normalizedText: "",
    history: [],
    forcePro: false,
    resolvedIntent: undefined,
    finish: (reply, status, record = true, extras = {}) =>
      finish(ports, msg, reply, status, record, extras),
    resolvePendingConfirm: () => resolvePendingConfirm(ports, msg),
    emitStage: (stage, detail) => ports.onStageEvent?.({ stage, command_id: null, detail }),
  };
}

/** received：发出接收事件、构建 deployment context、刷新 redis 会话态。 */
async function stageReceived<TMqtt>(ctx: PipelineContext<TMqtt>): Promise<StageResult> {
  const { msg, ports } = ctx;
  ctx.emitStage(
    "received",
    `${msg.platform} ${msg.text.startsWith("voice:") ? "语音" : "文本"}: "${msg.text.replace(/^voice:/, "")}"`,
  );
  ctx.deploymentContext = ctx.deploymentContext ?? (await ports.buildDeploymentContextCached());
  if (ports.sessionUsesRedis()) {
    await ports.refreshPendingConfirmsForUserFromRedis(msg.user_id);
    await ports.refreshPendingClarificationFromRedis(msg.user_id, msg.conversation_id);
  }
  return { kind: "continue" };
}

/** pendingConfirm：处理「确认」/「取消」文本与待确认操作。 */
async function stagePendingConfirm<TMqtt>(ctx: PipelineContext<TMqtt>): Promise<StageResult> {
  const { msg, ports, user, deps } = ctx;
  if (!ports.isConfirmText(msg.text) && !ports.isCancelText(msg.text)) {
    return { kind: "continue" };
  }
  if (!ports.sessionUsesRedis() && ports.isFlywheelDevBypass()) {
    ports.reloadPendingConfirmFromFile();
  }
  const pending = await ctx.resolvePendingConfirm();
  if (pending === "ambiguous") {
    return { kind: "early_return", result: ctx.finish(ambiguousPendingHint, 200) };
  }
  if (pending) {
    if (ports.isCancelText(msg.text)) {
      ports.clearPendingConfirm(pending.user_id, pending.conversation_id, pending.scene_skill_id);
      return { kind: "early_return", result: ctx.finish("已取消待执行操作。", 200) };
    }
    ports.logInfo("pending-confirm execute", {
      user_id: msg.user_id,
      conversation_id: pending.conversation_id,
      skill: pending.intent.skill,
    });
    const mqtt = await ports.connectMqtt(deps);
    ports.clearPendingConfirm(pending.user_id, pending.conversation_id, pending.scene_skill_id);
    const routed = await ports.routeIntent(pending.intent, {
      user_id: user.user_id,
      role: user.role,
      model: pending.model,
      utterance: msg.text,
      mqtt,
      conversation_id: pending.conversation_id,
      platform: msg.platform,
      skip_confirmation: true,
      user_confirmed: true,
      scene_skill_id: pending.scene_skill_id,
    });
    return { kind: "route", result: ctx.finish(routed.reply, routed.status, true, routed) };
  }
  if (ports.isConfirmText(msg.text)) {
    return {
      kind: "early_return",
      result: ctx.finish("当前没有待确认的操作。可以说「把 1 号棚打开 10 分钟」等指令。", 200),
    };
  }
  return { kind: "continue" };
}

/** stt：归一化 utterance、发出 STT 事件、预计算 forcePro/history。 */
function stageStt<TMqtt>(ctx: PipelineContext<TMqtt>): StageResult {
  const { msg, ports } = ctx;
  ctx.normalizedText = ports.normalizeUtterance(msg.text);
  ctx.emitStage("stt", `STT: "${ctx.normalizedText}" (conf=0.95)`);
  ctx.forcePro = ports.isUserCorrectionUtterance(ctx.normalizedText);
  ctx.history = ports.getConversationHistoryForLlm(msg.user_id, msg.conversation_id);
  return { kind: "continue" };
}

/** correction：用户更正语气清掉待确认操作。 */
async function stageCorrection<TMqtt>(ctx: PipelineContext<TMqtt>): Promise<StageResult> {
  const { ports } = ctx;
  if (!ports.isUserCorrectionUtterance(ctx.normalizedText)) {
    return { kind: "continue" };
  }
  const pending = await ctx.resolvePendingConfirm();
  if (pending === "ambiguous") {
    return { kind: "early_return", result: ctx.finish(ambiguousPendingHint, 200) };
  }
  if (pending) {
    ports.logInfo("pending-confirm cleared by user correction", {
      conversation_id: pending.conversation_id,
      was_skill: pending.intent.skill,
    });
    ports.clearPendingConfirm(pending.user_id, pending.conversation_id, pending.scene_skill_id);
  }
  return { kind: "continue" };
}

/** pendingClarification：合并待澄清槽位（通知偏好 / 意图）。 */
async function stagePendingClarification<TMqtt>(ctx: PipelineContext<TMqtt>): Promise<StageResult> {
  const { msg, ports, user, deps } = ctx;
  const pendingClarification = ports.getPendingClarification(msg.user_id, msg.conversation_id);
  if (!pendingClarification) return { kind: "continue" };
  const merged = ports.tryMergePendingClarification(
    ctx.normalizedText,
    pendingClarification,
    ports.buildActiveDomainAliasIndex(),
  );
  if (merged.kind === "notification_pref") {
    ports.suppressL2ForTonight(msg.user_id);
    ports.finishMergedIntent(msg.user_id, msg.conversation_id);
    return {
      kind: "early_return",
      result: ctx.finish("好的，今晚不再推送运营建议。明天如需恢复，直接发指令即可。", 200),
    };
  }
  if (merged.kind === "intent") {
    ports.finishMergedIntent(msg.user_id, msg.conversation_id);
    const mqtt = await ports.connectMqtt(deps);
    const routed = await ports.routeIntent(merged.intent, {
      user_id: user.user_id,
      role: user.role,
      model: deps.model,
      utterance: ctx.normalizedText,
      mqtt,
      conversation_id: msg.conversation_id,
      platform: msg.platform,
    });
    return { kind: "route", result: ctx.finish(routed.reply, routed.status, true, routed) };
  }
  if (!pendingClarification.expected_skill && pendingClarification.missing_slots.length === 0) {
    ports.clearPendingClarification(msg.user_id, msg.conversation_id);
  }
  return { kind: "continue" };
}

/** compoundQuery：复合 deployment 状态 + 天气查询。 */
async function stageCompoundQuery<TMqtt>(ctx: PipelineContext<TMqtt>): Promise<StageResult> {
  const { msg, ports, user, deps } = ctx;
  if (!ports.isCompoundDeploymentWeatherQuery(ctx.normalizedText)) {
    return { kind: "continue" };
  }
  const deployment_id = ports.getDeploymentId();
  const { status, weather } = ports.buildCompoundDeploymentWeatherIntents(deployment_id);
  const mqtt = await ports.connectMqtt(deps);
  const routeCtx = {
    user_id: user.user_id,
    role: user.role,
    model: deps.model,
    utterance: ctx.normalizedText,
    mqtt,
    conversation_id: msg.conversation_id,
    platform: msg.platform,
  };
  const [statusRouted, weatherRouted] = await Promise.all([
    ports.routeIntent(status, routeCtx),
    ports.routeIntent(weather, routeCtx),
  ]);
  const templateReply = `${statusRouted.reply}\n\n${weatherRouted.reply}`;
  const reply = await ports.renderCombinedQueryReply({
    userText: ctx.normalizedText,
    statusReply: statusRouted.reply,
    weatherReply: weatherRouted.reply,
    templateReply,
    history: ctx.history,
  });
  return { kind: "route", result: ctx.finish(reply, 200) };
}

/** escalation：意图解析（含升级）、失败捕获、澄清/失败早退。 */
async function stageEscalation<TMqtt>(ctx: PipelineContext<TMqtt>): Promise<StageResult> {
  const { msg, ports, deps } = ctx;
  const { result: resolved, meta } = await ports.resolveWithEscalation(
    ctx.normalizedText,
    ctx.deploymentContext,
    { llmClient: deps.llmClient, model: deps.model },
    {
      history: ctx.history,
      forcePro: ctx.forcePro,
      onEscalate: (info) => {
        ports.logInfo("intent escalating", {
          from: info.from,
          to: info.to,
          reason: info.reason,
          utterance: info.utterance.slice(0, 40),
        });
      },
    },
  );

  ports.captureFailureCaseFromChat({
    msg: { ...msg, text: ctx.normalizedText },
    deployment_id: ports.getDeploymentId(),
    model: deps.model,
    forcePro: ctx.forcePro,
    history: ctx.history,
    result: resolved,
    meta,
  });

  if (resolved.ok === false) {
    return { kind: "early_return", result: ctx.finish(resolved.message, 503) };
  }
  if (resolved.validation.kind === "clarification") {
    ports.setPendingClarification({
      user_id: msg.user_id,
      conversation_id: msg.conversation_id,
      expected_skill: undefined,
      missing_slots: [],
      partial: {},
      last_hint: resolved.validation.message,
    });
    return { kind: "early_return", result: ctx.finish(resolved.validation.message, 200) };
  }
  ctx.resolvedIntent = resolved.validation.intent;
  return { kind: "continue" };
}

/** route：最终意图路由 + NLG 渲染（终态，总返回 route 结果）。 */
async function stageRoute<TMqtt>(
  ctx: PipelineContext<TMqtt>,
): Promise<{ kind: "route"; result: ChatPipelineResult }> {
  const { msg, ports, user, deps } = ctx;
  const intent = ctx.resolvedIntent!;
  const mqtt = await ports.connectMqtt(deps);
  const routed = await ports.routeIntent(intent, {
    user_id: user.user_id,
    role: user.role,
    model: deps.model,
    utterance: ctx.normalizedText,
    mqtt,
    conversation_id: msg.conversation_id,
    platform: msg.platform,
  });
  const reply = await ports.renderReply({
    skill: intent.skill,
    templateReply: routed.reply,
    userText: ctx.normalizedText,
    history: ctx.history,
  });
  return { kind: "route", result: ctx.finish(reply, routed.status, true, routed) };
}

export async function runChatPipeline<TMqtt>(
  msg: NormalizedChatMessage,
  deps: ChatPipelineDeps<TMqtt>,
  ports: ChatPipelinePorts<TMqtt>,
): Promise<ChatPipelineResult> {
  const ctx = buildPipelineContext(msg, deps, ports);
  if (!ctx) return finish(ports, msg, ports.notBoundReply, 200, false);

  let r: StageResult;
  r = await stageReceived(ctx);
  if (r.kind !== "continue") return r.result;
  r = await stagePendingConfirm(ctx);
  if (r.kind !== "continue") return r.result;
  stageStt(ctx);
  r = await stageCorrection(ctx);
  if (r.kind !== "continue") return r.result;
  r = await stagePendingClarification(ctx);
  if (r.kind !== "continue") return r.result;
  r = await stageCompoundQuery(ctx);
  if (r.kind !== "continue") return r.result;
  r = await stageEscalation(ctx);
  if (r.kind !== "continue") return r.result;
  return (await stageRoute(ctx)).result;
}
