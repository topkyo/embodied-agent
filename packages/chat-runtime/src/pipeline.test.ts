import { describe, expect, it, vi } from "vitest";
import { runChatPipeline } from "./pipeline.js";
import type {
  ChatPipelinePorts,
  NormalizedChatMessage,
  PendingConfirmRecord,
  PendingClarificationRecord,
  RouteIntentResult,
} from "./types.js";
import type { LlmClient } from "@embodied-agent/agent";

function makePendingConfirm(overrides: Partial<PendingConfirmRecord> = {}): PendingConfirmRecord {
  return {
    deployment_id: "dep-1",
    intent: {
      skill: "test.skill",
      target: {},
      parameters: {},
      confidence: 1,
    },
    user_id: "u1",
    conversation_id: "c1",
    model: "test",
    ...overrides,
  };
}

function makeStubPorts(overrides: Partial<ChatPipelinePorts> = {}): ChatPipelinePorts {
  const calls = {
    appendConversationTurns: vi.fn(),
    clearPendingConfirm: vi.fn(),
    clearPendingClarification: vi.fn(),
    connectMqtt: vi.fn(async () => undefined),
    buildDeploymentContextCached: vi.fn(async () => ({})),
    refreshPendingConfirmsForUserFromRedis: vi.fn(async () => undefined),
    refreshPendingClarificationFromRedis: vi.fn(async () => undefined),
    reloadPendingConfirmFromFile: vi.fn(),
    logInfo: vi.fn(),
    suppressL2ForTonight: vi.fn(),
    finishMergedIntent: vi.fn(),
    captureFailureCaseFromChat: vi.fn(),
    setPendingClarification: vi.fn(),
  };

  const defaultRouteIntent = async (): Promise<RouteIntentResult> => ({
    reply: "route-reply",
    status: 200,
  });
  const defaultResolve = async () => ({
    result: { ok: false as const, message: "fallback" },
    meta: {},
  });

  return {
    notBoundReply: "not-bound",
    getUserStrict: () => ({ user_id: "u1", role: "operator" }),
    buildDeploymentContextCached: calls.buildDeploymentContextCached,
    sessionUsesRedis: () => false,
    refreshPendingConfirmsForUserFromRedis: calls.refreshPendingConfirmsForUserFromRedis,
    refreshPendingClarificationFromRedis: calls.refreshPendingClarificationFromRedis,
    isConfirmText: () => false,
    isCancelText: () => false,
    isFlywheelDevBypass: () => false,
    reloadPendingConfirmFromFile: calls.reloadPendingConfirmFromFile,
    listPendingConfirmsForConversation: () => [],
    getPendingConfirmForUser: () => undefined,
    listPendingConfirmsForUser: () => [],
    clearPendingConfirm: calls.clearPendingConfirm,
    routeIntent: defaultRouteIntent,
    normalizeUtterance: (text) => text,
    isUserCorrectionUtterance: () => false,
    getPendingClarification: () => undefined,
    tryMergePendingClarification: () => ({ kind: "none" }),
    buildActiveDomainAliasIndex: () => ({}),
    suppressL2ForTonight: calls.suppressL2ForTonight,
    finishMergedIntent: calls.finishMergedIntent,
    clearPendingClarification: calls.clearPendingClarification,
    getConversationHistoryForLlm: () => [],
    isCompoundDeploymentWeatherQuery: () => false,
    buildCompoundDeploymentWeatherIntents: () => ({
      status: { skill: "status", target: {}, parameters: {}, confidence: 1 },
      weather: { skill: "weather", target: {}, parameters: {}, confidence: 1 },
    }),
    renderCombinedQueryReply: async ({ templateReply }) => templateReply,
    resolveWithEscalation: defaultResolve,
    captureFailureCaseFromChat: calls.captureFailureCaseFromChat,
    setPendingClarification: calls.setPendingClarification,
    renderReply: async ({ templateReply }) => templateReply,
    getDeploymentId: () => "dep-1",
    appendConversationTurns: calls.appendConversationTurns,
    connectMqtt: calls.connectMqtt,
    logInfo: calls.logInfo,
    ...overrides,
  } as ChatPipelinePorts;
}

function makeMsg(text: string): NormalizedChatMessage {
  return { platform: "test", conversation_id: "c1", user_id: "u1", text, timestamp: "t" };
}

describe("runChatPipeline", () => {
  const deps = { llmClient: {} as LlmClient, model: "test" };

  it("returns notBoundReply for unbound user without recording", async () => {
    const ports = makeStubPorts({ getUserStrict: () => undefined });
    const result = await runChatPipeline(makeMsg("hi"), deps, ports);
    expect(result).toEqual({ reply: "not-bound", status: 200 });
    expect(ports.appendConversationTurns).not.toHaveBeenCalled();
  });

  it("routes confirm text with single pending and clears it", async () => {
    const pending = makePendingConfirm();
    const routeIntent = vi.fn(async () => ({ reply: "ok", status: 200 }));
    const ports = makeStubPorts({
      isConfirmText: () => true,
      getPendingConfirmForUser: () => pending,
      routeIntent,
    });
    const result = await runChatPipeline(makeMsg("确认"), deps, ports);
    expect(routeIntent).toHaveBeenCalledWith(
      pending.intent,
      expect.objectContaining({ skip_confirmation: true, user_confirmed: true }),
    );
    expect(ports.clearPendingConfirm).toHaveBeenCalledWith(
      pending.user_id,
      pending.conversation_id,
      pending.scene_skill_id,
    );
    expect(result).toEqual({ reply: "ok", status: 200 });
  });

  it("returns no pending confirm message when confirm text has none", async () => {
    const ports = makeStubPorts({ isConfirmText: () => true });
    const result = await runChatPipeline(makeMsg("确认"), deps, ports);
    expect(result.reply).toContain("当前没有待确认的操作");
    expect(ports.appendConversationTurns).toHaveBeenCalled();
  });

  it("cancels pending confirm on cancel text", async () => {
    const pending = makePendingConfirm();
    const ports = makeStubPorts({
      isCancelText: () => true,
      getPendingConfirmForUser: () => pending,
    });
    const result = await runChatPipeline(makeMsg("取消"), deps, ports);
    expect(result.reply).toBe("已取消待执行操作。");
    expect(ports.clearPendingConfirm).toHaveBeenCalledWith(
      pending.user_id,
      pending.conversation_id,
      pending.scene_skill_id,
    );
  });

  it("returns ambiguous hint when conversation has multiple pending confirms", async () => {
    const ports = makeStubPorts({
      isConfirmText: () => true,
      listPendingConfirmsForConversation: () => [
        makePendingConfirm(),
        makePendingConfirm({ scene_skill_id: "s2" }),
      ],
    });
    const result = await runChatPipeline(makeMsg("确认"), deps, ports);
    expect(result.reply).toContain("多个待确认操作");
  });

  it("returns ambiguous hint when user has multiple pending confirms", async () => {
    const ports = makeStubPorts({
      isConfirmText: () => true,
      getPendingConfirmForUser: () => undefined,
      listPendingConfirmsForUser: () => [
        makePendingConfirm(),
        makePendingConfirm({ scene_skill_id: "s2" }),
      ],
    });
    const result = await runChatPipeline(makeMsg("确认"), deps, ports);
    expect(result.reply).toContain("多个待确认操作");
  });

  it("merges clarification notification preference", async () => {
    const pending: PendingClarificationRecord = { missing_slots: [], expected_skill: "" };
    const ports = makeStubPorts({
      getPendingClarification: () => pending,
      tryMergePendingClarification: () => ({
        kind: "notification_pref",
        suppress_l2_tonight: true,
      }),
    });
    const result = await runChatPipeline(makeMsg("今晚不推送"), deps, ports);
    expect(result.reply).toBe("好的，今晚不再推送运营建议。明天如需恢复，直接发指令即可。");
    expect(ports.suppressL2ForTonight).toHaveBeenCalledWith("u1");
    expect(ports.finishMergedIntent).toHaveBeenCalledWith("u1", "c1");
  });

  it("merges clarification into intent and routes it", async () => {
    const intent = { skill: "test.skill", target: {}, parameters: {}, confidence: 1 };
    const routeIntent = vi.fn(async () => ({ reply: "merged", status: 200 }));
    const ports = makeStubPorts({
      getPendingClarification: () => ({ missing_slots: [] }),
      tryMergePendingClarification: () => ({ kind: "intent", intent }),
      routeIntent,
    });
    const result = await runChatPipeline(makeMsg("补充信息"), deps, ports);
    expect(ports.finishMergedIntent).toHaveBeenCalledWith("u1", "c1");
    expect(routeIntent).toHaveBeenCalledWith(intent, expect.any(Object));
    expect(result).toEqual({ reply: "merged", status: 200 });
  });

  it("routes compound weather query twice and renders combined reply", async () => {
    const routeIntent = vi
      .fn()
      .mockResolvedValueOnce({ reply: "status-reply", status: 200 })
      .mockResolvedValueOnce({ reply: "weather-reply", status: 200 });
    const renderCombinedQueryReply = vi.fn(
      async ({ templateReply }) => `combined:${templateReply}`,
    );
    const buildCompoundDeploymentWeatherIntents = vi.fn(() => ({
      status: { skill: "status", target: {}, parameters: {}, confidence: 1 },
      weather: { skill: "weather", target: {}, parameters: {}, confidence: 1 },
    }));
    const ports = makeStubPorts({
      isCompoundDeploymentWeatherQuery: () => true,
      routeIntent,
      renderCombinedQueryReply,
      buildCompoundDeploymentWeatherIntents,
    });
    const result = await runChatPipeline(makeMsg("状态和天气"), deps, ports);
    expect(buildCompoundDeploymentWeatherIntents).toHaveBeenCalledWith("dep-1");
    expect(routeIntent).toHaveBeenCalledTimes(2);
    expect(renderCombinedQueryReply).toHaveBeenCalled();
    expect(result.reply).toBe("combined:status-reply\n\nweather-reply");
  });

  it("stores clarification when escalation resolves to clarification", async () => {
    const setPendingClarification = vi.fn();
    const ports = makeStubPorts({
      resolveWithEscalation: async () => ({
        result: { ok: true, validation: { kind: "clarification", message: "请补充时长" } },
        meta: { x: 1 },
      }),
      setPendingClarification,
    });
    const result = await runChatPipeline(makeMsg("开窗"), deps, ports);
    expect(setPendingClarification).toHaveBeenCalledWith(
      expect.objectContaining({ last_hint: "请补充时长" }),
    );
    expect(result).toEqual({ reply: "请补充时长", status: 200 });
  });

  it("returns message and 503 when escalation fails", async () => {
    const ports = makeStubPorts({
      resolveWithEscalation: async () => ({
        result: { ok: false, message: "LLM 不可用" },
        meta: { x: 1 },
      }),
    });
    const result = await runChatPipeline(makeMsg("开窗"), deps, ports);
    expect(result).toEqual({ reply: "LLM 不可用", status: 503 });
  });

  it("clears pending confirm on user correction and continues routing", async () => {
    const pending = makePendingConfirm();
    const intent = { skill: "test.skill", target: {}, parameters: {}, confidence: 1 };
    const routeIntent = vi.fn(async () => ({ reply: "routed", status: 200 }));
    const ports = makeStubPorts({
      isUserCorrectionUtterance: () => true,
      getPendingConfirmForUser: () => pending,
      resolveWithEscalation: async () => ({
        result: { ok: true, validation: { kind: "intent", intent } },
        meta: {},
      }),
      routeIntent,
      renderReply: async ({ templateReply }) => `rendered:${templateReply}`,
    });
    const result = await runChatPipeline(makeMsg("不对，是灌溉"), deps, ports);
    expect(ports.clearPendingConfirm).toHaveBeenCalledWith(
      pending.user_id,
      pending.conversation_id,
      pending.scene_skill_id,
    );
    expect(routeIntent).toHaveBeenCalledWith(intent, expect.any(Object));
    expect(result).toEqual({ reply: "rendered:routed", status: 200 });
  });

  it("returns ambiguous hint when correction hits multiple pending confirms", async () => {
    const ports = makeStubPorts({
      isUserCorrectionUtterance: () => true,
      listPendingConfirmsForConversation: () => [
        makePendingConfirm(),
        makePendingConfirm({ scene_skill_id: "s2" }),
      ],
    });
    const result = await runChatPipeline(makeMsg("不对"), deps, ports);
    expect(result.reply).toContain("多个待确认操作");
  });

  it("clears empty pending clarification and continues to escalation", async () => {
    const clearPendingClarification = vi.fn();
    const resolveWithEscalation = vi.fn(async () => ({
      result: {
        ok: true,
        validation: {
          kind: "intent",
          intent: { skill: "test.skill", target: {}, parameters: {}, confidence: 1 },
        },
      },
      meta: {},
    }));
    const ports = makeStubPorts({
      getPendingClarification: () => ({ missing_slots: [], expected_skill: "" }),
      tryMergePendingClarification: () => ({ kind: "none" }),
      clearPendingClarification,
      resolveWithEscalation,
    });
    await runChatPipeline(makeMsg("继续"), deps, ports);
    expect(clearPendingClarification).toHaveBeenCalledWith("u1", "c1");
    expect(resolveWithEscalation).toHaveBeenCalled();
  });

  it("routes resolved intent through renderReply on normal path", async () => {
    const intent = { skill: "test.skill", target: {}, parameters: {}, confidence: 1 };
    const routeIntent = vi.fn(async () => ({
      reply: "template",
      status: 200,
      command_id: "cmd-1",
      execution_transport: "mqtt",
    }));
    const renderReply = vi.fn(async ({ templateReply }) => `nlg:${templateReply}`);
    const ports = makeStubPorts({
      resolveWithEscalation: async () => ({
        result: { ok: true, validation: { kind: "intent", intent } },
        meta: {},
      }),
      routeIntent,
      renderReply,
    });
    const result = await runChatPipeline(makeMsg("查状态"), deps, ports);
    expect(renderReply).toHaveBeenCalledWith(
      expect.objectContaining({ skill: "test.skill", templateReply: "template" }),
    );
    expect(result).toEqual({
      reply: "nlg:template",
      status: 200,
      command_id: "cmd-1",
      execution_transport: "mqtt",
    });
  });

  it("refreshes redis pending state on received stage", async () => {
    const refreshPendingConfirmsForUserFromRedis = vi.fn(async () => undefined);
    const refreshPendingClarificationFromRedis = vi.fn(async () => undefined);
    const ports = makeStubPorts({
      sessionUsesRedis: () => true,
      refreshPendingConfirmsForUserFromRedis,
      refreshPendingClarificationFromRedis,
      resolveWithEscalation: async () => ({
        result: { ok: false, message: "stop" },
        meta: {},
      }),
    });
    await runChatPipeline(makeMsg("查状态"), deps, ports);
    expect(refreshPendingConfirmsForUserFromRedis).toHaveBeenCalledWith("u1");
    expect(refreshPendingClarificationFromRedis).toHaveBeenCalledWith("u1", "c1");
  });

  it("reloads pending confirm from file in flywheel dev bypass before confirm", async () => {
    const pending = makePendingConfirm();
    const reloadPendingConfirmFromFile = vi.fn();
    const routeIntent = vi.fn(async () => ({ reply: "ok", status: 200 }));
    const ports = makeStubPorts({
      sessionUsesRedis: () => false,
      isFlywheelDevBypass: () => true,
      isConfirmText: () => true,
      reloadPendingConfirmFromFile,
      getPendingConfirmForUser: () => pending,
      routeIntent,
    });
    await runChatPipeline(makeMsg("确认"), deps, ports);
    expect(reloadPendingConfirmFromFile).toHaveBeenCalled();
    expect(routeIntent).toHaveBeenCalled();
  });
});
