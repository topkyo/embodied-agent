import type { AgentRuntimeContext } from "../context.js";
import type { AgentRuntimeBindings } from "../runtime-bindings.js";
import type { IntentPayload, StructuralHistoryTurn } from "@embodied-agent/core";
import {
  resolveIntent,
  type ResolveIntentResult,
  type ResolveIntentOptions,
  type LlmClient,
} from "./llm.js";
import {
  resolveWithEscalation,
  type ResolveWithEscalationOpts,
  type EscalationMeta,
} from "./resolve-with-escalation.js";
import { buildSystemPrompt } from "./prompt.js";
import type { DeploymentContext } from "./prompt.js";
import {
  buildDeploymentContext,
  buildDeploymentContextCached,
  buildDeploymentContextSync,
  clearDeploymentContextCacheForTests,
} from "./deployment-context.js";
import { normalizeUtterance } from "./normalize-utterance.js";
import { validateLlmJson, type IntentValidationResult } from "./validate.js";
import {
  evaluateProEscalation,
  detectSkillUtteranceConflict,
  isUserCorrectionUtterance,
  type ProEscalationReason,
} from "./pro-escalation.js";
import { intentOutputJsonSchema, intentResponseFormat } from "./intent-json-schema.js";
import {
  recordIntentFailureUnified,
  loadIntentFailures,
  upsertIntentFailureCase,
  markFailurePromoted,
  failuresPath,
  type IntentFailureCase,
  type RecordIntentFailureInput,
} from "./failure-store.js";
import { captureFailureCaseFromChat, type ChatMessageSlice } from "./failure-case-capture.js";
import {
  promoteCasesToWechat,
  type PromoteWechatOptions,
  type PromoteWechatResult,
  validatePromoteRequest,
} from "./promote-wechat-runner.js";
import { startPromoteWechatJob, type StartPromoteJobResult } from "./promote-wechat-job.js";
import { resolveUtteranceText, transcribeAudioBase64 } from "./stt.js";
import { refineIntentFromUtterance, normalizeLlmShape } from "./normalize.js";
import {
  tryStructuralIntentOverride,
  refineStructuralIntentFromUtterance,
} from "./structural-intent.js";

/**
 * IntentResolver：以 AgentRuntimeContext 闭包捕获 bindings，对外暴露已绑定 bindings 的入口函数。
 * 调用方无需再传递 bindings；组合根（apps/api / scripts / tests）通过 createIntentResolver(ctx) 创建实例。
 */
export type IntentResolver = {
  readonly bindings: AgentRuntimeBindings;
  readonly context: AgentRuntimeContext;
  resolveIntent(
    text: string,
    ctx: DeploymentContext,
    client: LlmClient,
    modelLabel?: string,
    opts?: ResolveIntentOptions,
  ): Promise<ResolveIntentResult>;
  resolveWithEscalation(
    text: string,
    deploymentContext: DeploymentContext,
    deps: { llmClient: LlmClient; model: string },
    opts?: ResolveWithEscalationOpts,
  ): Promise<{ result: ResolveIntentResult; meta: EscalationMeta }>;
  buildSystemPrompt(ctx: DeploymentContext): string;
  buildDeploymentContext(): Promise<DeploymentContext>;
  buildDeploymentContextCached(): Promise<DeploymentContext>;
  buildDeploymentContextSync(): DeploymentContext;
  clearDeploymentContextCacheForTests(): void;
  normalizeUtterance(text: string): string;
  validateLlmJson(data: unknown): IntentValidationResult;
  evaluateProEscalation(opts: {
    result: import("./pro-escalation.js").ResolveIntentForEscalation;
    utterance: string;
    force?: boolean;
  }): { escalate: boolean; reason?: ProEscalationReason };
  detectSkillUtteranceConflict(utterance: string, skill: string): boolean;
  isUserCorrectionUtterance(text: string): boolean;
  intentOutputJsonSchema(): Record<string, unknown>;
  intentResponseFormat(strict: boolean): Record<string, unknown>;
  recordIntentFailureUnified(entry: RecordIntentFailureInput): IntentFailureCase;
  loadIntentFailures(deploymentId?: string): IntentFailureCase[];
  upsertIntentFailureCase(
    patch: Omit<IntentFailureCase, "id" | "promoted" | "recorded_at"> & {
      utterance: string;
      promoted?: boolean;
    },
  ): IntentFailureCase;
  markFailurePromoted(id: string, dest?: IntentFailureCase["promote_dest"]): void;
  failuresPath(deploymentId?: string): string;
  captureFailureCaseFromChat(opts: {
    msg: ChatMessageSlice;
    deployment_id: string;
    model: string;
    forcePro: boolean;
    history: readonly { role: "user" | "assistant"; content: string }[];
    result: ResolveIntentResult;
    meta: EscalationMeta;
    previous_command_id?: string;
  }): void;
  promoteCasesToWechat(opts?: PromoteWechatOptions): Promise<PromoteWechatResult>;
  startPromoteWechatJob(opts?: Omit<PromoteWechatOptions, "fromApi">): StartPromoteJobResult;
  validatePromoteRequest(ids: string[]): ReturnType<typeof validatePromoteRequest>;
  resolveUtteranceText(input: {
    text?: string;
    audio_base64?: string;
    audio_format?: string;
  }): Promise<{ text: string; from_stt: boolean }>;
  transcribeAudioBase64(opts: {
    audioBase64: string;
    format?: string;
    language?: string;
  }): Promise<string>;
  refineIntentFromUtterance(utterance: string, intent: IntentPayload): IntentPayload;
  normalizeLlmShape(data: unknown): unknown;
  tryStructuralIntentOverride(
    utterance: string,
    history?: readonly StructuralHistoryTurn[],
  ): IntentPayload | null;
  refineStructuralIntentFromUtterance(utterance: string, intent: IntentPayload): IntentPayload;
};

export function createIntentResolver(ctx: AgentRuntimeContext): IntentResolver {
  const bindings = ctx.bindings;
  return {
    bindings,
    context: ctx,
    resolveIntent: (text, dctx, client, modelLabel, opts) =>
      resolveIntent(bindings, text, dctx, client, modelLabel, opts),
    resolveWithEscalation: (text, deploymentContext, deps, opts) =>
      resolveWithEscalation(bindings, text, deploymentContext, deps, opts),
    buildSystemPrompt: (dctx) => buildSystemPrompt(bindings, dctx),
    buildDeploymentContext: () => buildDeploymentContext(bindings),
    buildDeploymentContextCached: () => buildDeploymentContextCached(bindings),
    buildDeploymentContextSync: () => buildDeploymentContextSync(bindings),
    clearDeploymentContextCacheForTests: () => clearDeploymentContextCacheForTests(),
    normalizeUtterance: (text) => normalizeUtterance(bindings, text),
    validateLlmJson: (data) => validateLlmJson(bindings, data),
    evaluateProEscalation: (opts) => evaluateProEscalation(bindings, opts),
    detectSkillUtteranceConflict: (utterance, skill) =>
      detectSkillUtteranceConflict(bindings, utterance, skill),
    isUserCorrectionUtterance: (text) => isUserCorrectionUtterance(text),
    intentOutputJsonSchema: () => intentOutputJsonSchema(bindings),
    intentResponseFormat: (strict) => intentResponseFormat(bindings, strict),
    recordIntentFailureUnified: (entry) => recordIntentFailureUnified(bindings, entry),
    loadIntentFailures: (deploymentId) => loadIntentFailures(bindings, deploymentId),
    upsertIntentFailureCase: (patch) => upsertIntentFailureCase(bindings, patch),
    markFailurePromoted: (id, dest) => markFailurePromoted(bindings, id, dest),
    failuresPath: (deploymentId) => failuresPath(bindings, deploymentId),
    captureFailureCaseFromChat: (opts) => captureFailureCaseFromChat(bindings, opts),
    promoteCasesToWechat: (opts) => promoteCasesToWechat(bindings, opts),
    startPromoteWechatJob: (opts) => startPromoteWechatJob(bindings, opts),
    validatePromoteRequest: (ids) => validatePromoteRequest(bindings, ids),
    resolveUtteranceText: (input) => resolveUtteranceText(bindings, input),
    transcribeAudioBase64: (opts) => transcribeAudioBase64(bindings, opts),
    refineIntentFromUtterance: (utterance, intent) =>
      refineIntentFromUtterance(bindings, utterance, intent),
    normalizeLlmShape: (data) => normalizeLlmShape(bindings, data),
    tryStructuralIntentOverride: (utterance, history) =>
      tryStructuralIntentOverride(bindings, utterance, history),
    refineStructuralIntentFromUtterance: (utterance, intent) =>
      refineStructuralIntentFromUtterance(bindings, utterance, intent),
  };
}
