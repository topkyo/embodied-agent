import type { DomainPackClarificationMergeResult, IntentPayload } from "@embodied-agent/core";
import type { LlmChatTurn, LlmClient } from "@embodied-agent/agent";

export type NormalizedChatMessage = {
  platform: string;
  conversation_id: string;
  user_id: string;
  text: string;
  timestamp: string;
};

export type ChatPipelineDeps<TMqtt = unknown> = {
  llmClient: LlmClient;
  model: string;
  deploymentContext?: unknown;
  mqtt?: TMqtt;
  mqttEnabled?: boolean;
  mqttUrl?: string;
};

export type ChatPipelineResult = {
  reply: string;
  status: number;
  command_id?: string;
  execution_transport?: string;
  lifecycle_state?: "created" | "sent" | "completed" | "failed";
  params?: Record<string, unknown>;
};

export type ChatUserRecord = {
  user_id: string;
  role: string;
};

export type PendingConfirmRecord = {
  deployment_id: string;
  intent: IntentPayload;
  user_id: string;
  conversation_id: string;
  model: string;
  scene_skill_id?: string;
};

export type PendingClarificationRecord = {
  expected_skill?: string;
  missing_slots: string[];
};

export type RouteIntentResult = {
  reply: string;
  status: number;
  command_id?: string;
  execution_transport?: string;
  lifecycle_state?: "created" | "sent" | "completed" | "failed";
  params?: Record<string, unknown>;
};

export type RouteIntentContext<TMqtt = unknown> = {
  user_id: string;
  role: string;
  model: string;
  utterance: string;
  mqtt?: TMqtt;
  conversation_id: string;
  platform: string;
  skip_confirmation?: boolean;
  user_confirmed?: boolean;
  scene_skill_id?: string;
};

export type IntentResolveResult =
  | { ok: false; message: string }
  | { ok: true; validation: { kind: "clarification"; message: string } }
  | { ok: true; validation: { kind: "intent"; intent: IntentPayload } };

export type ClarificationMergeResult = DomainPackClarificationMergeResult;

/** User binding lookup. */
export type ChatUserPorts = {
  notBoundReply: string;
  getUserStrict(userId: string): ChatUserRecord | undefined;
};

/** Pending confirm / clarification session state. */
export type ChatSessionPorts = {
  sessionUsesRedis(): boolean;
  refreshPendingConfirmsForUserFromRedis(userId: string): Promise<void>;
  refreshPendingClarificationFromRedis(userId: string, conversationId: string): Promise<void>;
  isConfirmText(text: string): boolean;
  isCancelText(text: string): boolean;
  isFlywheelDevBypass(): boolean;
  reloadPendingConfirmFromFile(): void;
  listPendingConfirmsForConversation(
    userId: string,
    conversationId: string,
  ): PendingConfirmRecord[];
  getPendingConfirmForUser(userId: string): PendingConfirmRecord | undefined;
  listPendingConfirmsForUser(userId: string): PendingConfirmRecord[];
  clearPendingConfirm(userId: string, conversationId: string, sceneSkillId?: string): void;
  getPendingClarification(
    userId: string,
    conversationId: string,
  ): PendingClarificationRecord | undefined;
  tryMergePendingClarification(
    text: string,
    pending: PendingClarificationRecord,
    aliasIndex: unknown,
  ): ClarificationMergeResult;
  buildActiveDomainAliasIndex(): unknown;
  suppressL2ForTonight(userId: string): void;
  finishMergedIntent(userId: string, conversationId: string): void;
  clearPendingClarification(userId: string, conversationId: string): void;
  setPendingClarification(input: {
    user_id: string;
    conversation_id: string;
    expected_skill?: string;
    missing_slots: string[];
    partial: Record<string, unknown>;
    last_hint: string;
  }): void;
};

/** Conversation history persistence. */
export type ChatConversationPorts = {
  getConversationHistoryForLlm(userId: string, conversationId: string): readonly LlmChatTurn[];
  appendConversationTurns(
    userId: string,
    conversationId: string,
    turns: readonly LlmChatTurn[],
  ): void;
};

/** LLM intent resolution and failure capture. */
export type ChatIntentPorts = {
  normalizeUtterance(text: string): string;
  isUserCorrectionUtterance(text: string): boolean;
  buildDeploymentContextCached(): Promise<unknown>;
  resolveWithEscalation(
    text: string,
    deploymentContext: unknown,
    llm: { llmClient: LlmClient; model: string },
    opts: {
      history: readonly LlmChatTurn[];
      forcePro: boolean;
      onEscalate: (info: { from: string; to: string; reason: string; utterance: string }) => void;
    },
  ): Promise<{ result: IntentResolveResult; meta: unknown }>;
  captureFailureCaseFromChat(input: unknown): void;
};

/** Deterministic routing and MQTT connectivity. */
export type ChatRoutingPorts<TMqtt = unknown> = {
  routeIntent(intent: IntentPayload, ctx: RouteIntentContext<TMqtt>): Promise<RouteIntentResult>;
  connectMqtt(deps: ChatPipelineDeps<TMqtt>): Promise<TMqtt | undefined>;
};

/** NLG rendering for template replies. */
export type ChatNlgPorts = {
  renderReply(opts: {
    skill: string;
    templateReply: string;
    userText: string;
    history?: readonly LlmChatTurn[];
  }): Promise<string>;
  renderCombinedQueryReply(opts: {
    userText: string;
    statusReply: string;
    weatherReply: string;
    templateReply: string;
    history?: readonly LlmChatTurn[];
  }): Promise<string>;
};

/** Compound deployment status + weather queries. */
export type ChatCompoundQueryPorts = {
  isCompoundDeploymentWeatherQuery(text: string): boolean;
  buildCompoundDeploymentWeatherIntents(deploymentId: string): {
    status: IntentPayload;
    weather: IntentPayload;
  };
  getDeploymentId(): string;
};

export type ChatLoggingPorts = {
  logInfo(event: string, fields: Record<string, unknown>): void;
};

/** Stage event persistence for received/stt/telemetry timeline. */
export type ChatStageEventPorts = {
  onStageEvent?(event: {
    stage: "received" | "stt";
    command_id: string | null;
    detail: string;
  }): void;
};

/** Host adapter surface — composed port groups, not a storage God-object. */
export type ChatPipelinePorts<TMqtt = unknown> = ChatUserPorts &
  ChatSessionPorts &
  ChatConversationPorts &
  ChatIntentPorts &
  ChatRoutingPorts<TMqtt> &
  ChatNlgPorts &
  ChatCompoundQueryPorts &
  ChatLoggingPorts &
  ChatStageEventPorts;
