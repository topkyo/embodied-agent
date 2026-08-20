import type { IntentPayload } from "./schemas/intent.js";
import type { CommandMessage } from "./schemas/command.js";
import type { DeviceRegistry, RegistryDevice } from "./registry.js";
import type { DomainPackReadinessIssue } from "./domain-pack-manifest.js";
import type {
  OutcomeThresholds,
  RiskLevel,
  SceneModeState,
  SceneResolvedDeviceTarget,
  SceneTelemetrySlice,
  SceneTrigger,
  StructuralHistoryTurn,
} from "./scene-primitives.js";

export type DomainPackRuntimeReadinessContext = {
  deployment_id: string;
  domainConfig?: unknown;
  registry: DeviceRegistry;
  onlineNodeIds?: readonly string[];
};

export type DomainPackRuntimeReadinessCheck = {
  id: string;
  ok: boolean;
  label: string;
  detail: string;
  severity: "error" | "warning";
};

export type DomainPackRuntimeFlywheelReadinessContext = {
  deployment_id: string;
  now: number;
  services: {
    isSustainedAlertReady(entityId: string): boolean;
  };
};

export type DomainPackRuntimeFlywheelReadiness = {
  requiredTelemetry: readonly {
    entity_id: string;
    metric: string;
  }[];
  requiredNodes: readonly string[];
  probe?(
    context: DomainPackRuntimeFlywheelReadinessContext,
  ): Promise<DomainPackRuntimeReadinessCheck[]> | DomainPackRuntimeReadinessCheck[];
};

export type DomainPackFlywheelGate = {
  adapterModule: string;
  description: string;
  reportPath?: string;
  requiredServices?: readonly string[];
};

export type DomainPackRuntimeReadiness = {
  requiredTransports?: readonly string[];
  flywheel?: DomainPackRuntimeFlywheelReadiness;
  /** 运行时从 registry + domainConfig 解析 flywheel 契约；优先于静态 flywheel。 */
  resolveFlywheel?(
    context: Pick<DomainPackRuntimeReadinessContext, "deployment_id" | "domainConfig" | "registry">,
  ): DomainPackRuntimeFlywheelReadiness;
  flywheelGate?: DomainPackFlywheelGate;
  probeNotRequired?: { reason: string };
  validateConfig?(context: DomainPackRuntimeReadinessContext): DomainPackReadinessIssue[];
  validateRegistry?(context: DomainPackRuntimeReadinessContext): DomainPackReadinessIssue[];
  probe?(
    context: DomainPackRuntimeReadinessContext,
  ): Promise<DomainPackRuntimeReadinessCheck[]> | DomainPackRuntimeReadinessCheck[];
};

export type DomainPackTargetResolver = {
  isPhysicalControlSkill(intent: IntentPayload): boolean;
  preparePhysicalIntent?(
    intent: IntentPayload,
    context: { domainConfig?: unknown },
  ): IntentPayload | { ok: false; reason: string };
  resolveDeviceTarget(
    intent: IntentPayload,
    registry: DeviceRegistry,
    context: { deployment_id: string; domainConfig?: unknown },
  ): { ok: true; target: SceneResolvedDeviceTarget } | { ok: false; reason: string };
};

export type DomainPackPhysicalExecutor = {
  canExecuteTarget(target: SceneResolvedDeviceTarget): boolean;
  execute(
    intent: IntentPayload,
    target: SceneResolvedDeviceTarget,
    context: { domainConfig?: unknown },
  ): Promise<unknown>;
  failureCode?: string;
  logFields?: Record<string, unknown>;
};

export type DomainPackSkillHandlerResult = {
  reply: string;
  params: Record<string, unknown>;
};

export type DomainPackSkillHandler = {
  serviceKeys?: readonly string[];
  canHandle(intent: IntentPayload): boolean;
  handle(
    intent: IntentPayload,
    context: {
      domainConfig?: unknown;
      deploymentId: string;
      userId?: string;
      services?: Record<string, unknown>;
    },
  ): Promise<DomainPackSkillHandlerResult>;
};

export type DomainPackCommandReplies = {
  physicalCommandSentReply?(skill: IntentPayload["skill"]): string | undefined;
  pendingSummary?(intent: IntentPayload): string | undefined;
  commandStatusMessage?(
    record: unknown,
    context?: { services?: Record<string, unknown> },
  ): string | null | undefined;
};

export type DomainPackNlgConfig = {
  eligibleSkills: readonly string[];
  replySystemPrompt: string;
  combinedQuerySystemPrompt?: string;
  proactiveSummarySystemPrompt?: string;
};

export type DomainPackCommandPatch = {
  action: CommandMessage["action"];
  parameters?: Record<string, unknown>;
  device_type?: string;
};

export type DomainPackCommandBuilder = {
  buildCommandPatch(
    intent: IntentPayload,
    target: SceneResolvedDeviceTarget,
  ): DomainPackCommandPatch | null;
};

export type DomainPackClarificationAliasIndex = Record<string, string[]>;

export type DomainPackPendingClarificationPartial = Record<string, string | number | undefined>;

export type DomainPackPendingClarification = {
  expected_skill?: string;
  missing_slots: readonly string[];
  partial: DomainPackPendingClarificationPartial;
  last_rejected_intent?: IntentPayload;
};

export type DomainPackClarificationMergeResult =
  | { kind: "intent"; intent: IntentPayload }
  | { kind: "notification_pref"; suppress_l2_tonight: true }
  | { kind: "none" };

export type DomainPackPendingClarificationDraft = {
  expected_skill?: string;
  missing_slots: string[];
  partial: DomainPackPendingClarificationPartial;
  last_hint?: string;
};

export type DomainPackClarificationHandler = {
  tryMergePendingClarification(
    text: string,
    pending: DomainPackPendingClarification,
    aliases: DomainPackClarificationAliasIndex,
  ): DomainPackClarificationMergeResult;
  inferClarificationFromIntent?(
    intent: IntentPayload,
    hint?: string,
  ): DomainPackPendingClarificationDraft | null;
  partialFromIntent?(intent: IntentPayload): DomainPackPendingClarificationPartial;
};

export type DomainPackPreDispatchPhase = "pre_safety" | "post_confirmation";

export type DomainPackPreDispatchResult =
  { type: "continue" } | { type: "reply"; reply: string; status: number };

export type DomainPackPreDispatchHandler = {
  handle(
    phase: DomainPackPreDispatchPhase,
    intent: IntentPayload,
    context: {
      userId: string;
      conversationId?: string;
      model: string;
      deploymentId: string;
      services?: Record<string, unknown>;
    },
  ): DomainPackPreDispatchResult;
};

export type DomainPackUserRole = "owner" | "operator" | "worker" | "viewer" | "readonly";

export type DomainPackAuthorizationPolicy = {
  controlSkills: readonly string[];
  workerAllowedSkills: readonly string[];
  readonlyAllowedSkills: readonly string[];
  privilegedSkills?: readonly string[];
  denialReasons?: {
    worker?: string;
    readonly?: string;
    privileged?: string;
    skill?: Record<string, string>;
  };
};

export type DomainPackSafetyDeviceState = {
  device_id: string;
  status: "active" | "offline" | "maintenance" | "disabled";
  manual_override: boolean;
  running_action?: "open" | "close" | "start" | null;
};

export type DomainPackSafetyDecision = {
  allowed: boolean;
  requires_confirmation: boolean;
  reason: string;
  reject_code?: string;
  guidance?: string;
};

export type DomainPackSafetyContext = {
  user_id: string;
  role: DomainPackUserRole;
  skill: string;
  intent: IntentPayload;
  device?: DomainPackSafetyDeviceState;
  confirm_duration_threshold_seconds: number;
};

export type DomainPackSafetyPolicy = {
  authorization: DomainPackAuthorizationPolicy;
  /** Seconds at or above which physical control requires user confirmation. */
  confirmDurationThresholdSeconds: number;
  requestedDurationSeconds?(intent: IntentPayload): number | undefined;
  interlockAction?(intent: IntentPayload): "open" | "close" | undefined;
  interlockConflictReason?: string;
  interlockConflictGuidance?: string;
  evaluateIntent?(ctx: DomainPackSafetyContext): DomainPackSafetyDecision | null;
  stopSkills?: readonly string[];
  stopReason?: string;
};

export type DomainPackIntentPromptGuidance = {
  parserPreamble?: string;
  clarificationRule?: string;
  disambiguationRules?: string;
  examples?: string;
};

export type DomainPackIntentPromptProvider = {
  parserPreamble?: string;
  clarificationRule?: string;
  disambiguationRules?(deploymentTarget: string): string;
  examples?(deploymentTarget: string): string;
};

export type DomainPackIntentProcessing = {
  prompt?: DomainPackIntentPromptProvider;
  normalizeUtterance?(text: string): string;
  normalizeLlmShape?(data: unknown): unknown;
  refineIntentFromUtterance?(utterance: string, intent: IntentPayload): IntentPayload;
  detectSkillUtteranceConflict?(utterance: string, skill: string): boolean;
  isLowConfidenceControlSkill?(skill: string): boolean;
};

export type DomainPackAliasIndex = Record<string, string[]>;

export type DomainPackConversation = {
  buildAliasIndex?(
    registry: DeviceRegistry,
    deploymentId: string,
    domainConfig?: unknown,
  ): DomainPackAliasIndex;
  matchCompoundQuery?(text: string): boolean;
  buildCompoundQueryIntents?(deploymentId: string): Record<string, IntentPayload>;
};

export type DomainPackStructuralOverrides = {
  tryStructuralIntentOverride?(
    utterance: string,
    history?: readonly StructuralHistoryTurn[],
  ): IntentPayload | null;
  refineIntentFromUtterance?(utterance: string, intent: IntentPayload): IntentPayload;
};

export type DomainPackModeStore = {
  getMode(entityId: string): SceneModeState | undefined;
  setMode(entityId: string, userId: string, params: Record<string, unknown>): SceneModeState;
  resetForTests?(): void;
};

export type DomainPackOutcomeEvaluationInput = {
  scene_skill_id: string;
  command_status: string;
  before?: SceneTelemetrySlice;
  after?: SceneTelemetrySlice;
  window_minutes: number;
};

export type DomainPackSustainedAlertInput = {
  deploymentId: string;
  entityId: string;
  metric: string;
  operator: string;
  threshold: number;
  current: number;
  streakMinutes: number;
  telemetry: SceneTelemetrySlice;
  devices: readonly RegistryDevice[];
};

export type DomainPackSustainedAlertL2Plan = {
  cooldownKeyPrefix: string;
  templateText: string;
  summaryData: Record<string, unknown>;
  confirmIntent: IntentPayload;
  sceneSkillId?: string;
};

export type DomainPackProactiveAlerts = {
  sustainedL1Message(input: DomainPackSustainedAlertInput): string;
  sustainedL2Plan(input: DomainPackSustainedAlertInput): DomainPackSustainedAlertL2Plan | null;
};

export type DomainPackScheduledReportSchedule = {
  deploymentId: string;
  userId: string;
  entityIds: readonly string[];
  intervalMinutes: number;
};

export type DomainPackScheduledReportServices = {
  getTelemetry(entityId: string): SceneTelemetrySlice | undefined;
};

export type DomainPackScheduledReports = {
  buildMessage(
    schedule: DomainPackScheduledReportSchedule,
    services: DomainPackScheduledReportServices,
  ): string;
};

export type DomainPackPolicyAlertRule = {
  entity_id: string;
  metric: string;
  operator: ">" | "<" | ">=" | "<=";
  value: number;
  enabled?: boolean;
};

export type DomainPackPolicyOutcomeStats = {
  total: number;
  success: number;
};

export type DomainPackPolicySuggestionDraft = {
  kind: string;
  sceneSkillId?: string;
  reason: string;
  intent: IntentPayload;
};

export type DomainPackPolicySuggestionServices = {
  outcomeStatsByScene(
    sceneSkillId: string,
    sinceDays: number,
  ): Record<string, DomainPackPolicyOutcomeStats | undefined>;
};

export type DomainPackPolicyAlertRuleUpdate = {
  entity_id: string;
  metric: string;
  operator: ">" | "<" | ">=" | "<=";
  value: number;
};

export type DomainPackPolicySuggestions = {
  buildDrafts(input: {
    deploymentId: string;
    alertRules: readonly DomainPackPolicyAlertRule[];
    services: DomainPackPolicySuggestionServices;
  }): readonly DomainPackPolicySuggestionDraft[];
  buildAlertRuleUpdate(intent: IntentPayload): DomainPackPolicyAlertRuleUpdate | null;
};

export type DomainPackCompletedCommandPlan = {
  templateText: string;
  intent: IntentPayload;
  sceneSkillId?: string;
};

export type DomainPackDeviceFailurePlan = {
  templateText: string;
  sceneSkillId?: string;
};

export type DomainPackCommandHooks = {
  buildCompletedCommandPlan(input: {
    command: CommandMessage;
    entityId?: string;
  }): DomainPackCompletedCommandPlan | null;
  buildDeviceFailurePlan(input: {
    deviceId: string;
    entityId?: string;
    failureCount: number;
  }): DomainPackDeviceFailurePlan | null;
  /**
   * 设备失败通知触发判定（场景调参下沉 pack）。
   * host 负责计数（countRecentDeviceFailures）与去重，pack 决定阈值。
   * 未实现时 host 不触发设备失败通知（其他 pack 可不实现）。
   */
  shouldNotifyDeviceFailure?(input: {
    deviceId: string;
    deploymentId: string;
    failureCount: number;
  }): boolean;
};

export type DomainPackOperationLogSlice = {
  ts: string;
  skill: string;
  result: string;
};

export type DomainPackDigestServices = {
  getAllTelemetry(): readonly SceneTelemetrySlice[];
  getModeByEntityId(entityId: string): SceneModeState | undefined | null;
  queryLogsToday(deploymentId: string): readonly DomainPackOperationLogSlice[];
};

export type DomainPackDigest = {
  buildMessage(input: {
    slot: "morning" | "evening";
    deploymentName: string;
    deploymentId: string;
    services: DomainPackDigestServices;
  }): string;
};

export type DomainPackWeeklyAdviceInput = {
  deploymentId: string;
  pilotRoiSummary: string;
  sceneOutcomesSummary: string;
  pilotBaseline?: string;
  policySuggestions?: string;
  telemetry: readonly SceneTelemetrySlice[];
  alertRules: readonly string[];
  recentOperations: readonly string[];
};

export type DomainPackWeeklyAdvice = {
  systemPrompt: string;
  buildUserPrompt(input: DomainPackWeeklyAdviceInput): string;
  formatFallback(input: DomainPackWeeklyAdviceInput): string;
};

export type DomainPackWeatherAlert = {
  message: string;
  [key: string]: unknown;
};

export type DomainPackWeatherProactivePlan = {
  kind: string;
  templateText: string;
  data: Record<string, unknown>;
  sceneSkillId?: string;
  pendingIntent?: IntentPayload;
};

export type DomainPackWeatherProactive = {
  buildColdPlan(alert: DomainPackWeatherAlert): DomainPackWeatherProactivePlan;
  buildHeatPlan(input: {
    alert: DomainPackWeatherAlert;
    telemetry: readonly SceneTelemetrySlice[];
  }): DomainPackWeatherProactivePlan;
  /** 飞轮 dev bypass 无现场遥测时，由 active pack 从 registry entities 合成 telemetry。 */
  buildFlywheelHeatFallbackTelemetry?(input: {
    deployment_id: string;
    primary_metric_value: number;
    entities: readonly {
      entity_id: string;
      entity_type: string;
      deployment_id: string;
      status: string;
    }[];
  }): readonly SceneTelemetrySlice[];
};

export type DomainPackRuntime = {
  sceneSkillIds: readonly string[];
  isSceneSkillId(scene_skill_id: string): boolean;
  resolveSceneForTrigger(trigger: SceneTrigger): string | null;
  resolveSceneFromIntent(intent: IntentPayload): string | null;
  evaluateOutcomeSuccess(input: DomainPackOutcomeEvaluationInput): boolean;
  sceneSuccessMetric(scene_skill_id: string): string;
  riskLevelForScene(scene_skill_id: string): RiskLevel | undefined;
  riskLevelForPhysicalSkill(
    skill: string,
    opts?: { requires_confirmation?: boolean; scene_skill_id?: string },
  ): RiskLevel;
  outcomeThresholdsForScene(scene_skill_id: string): OutcomeThresholds;
};

export type DomainPackContext = {
  includeTelemetry?: boolean;
  includeAlertRules?: boolean;
  buildDeploymentContext(
    registry: DeviceRegistry,
    deployment_id: string,
    domainConfig?: unknown,
  ): {
    scene_context_sections: string[];
  };
  buildModesSummary?(
    telemetry: readonly SceneTelemetrySlice[],
    getMode: (entityId: string) => SceneModeState | undefined,
  ): string | undefined;
};
