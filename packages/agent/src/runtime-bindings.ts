import type { DeviceRegistry, DomainPackEvalPaths } from "@embodied-agent/core";
import type { IntentParseResult } from "@embodied-agent/core";
import type {
  DomainPackIntentPromptGuidance,
  IntentPayload,
  SceneModeState,
  SceneTelemetrySlice,
  StructuralHistoryTurn,
} from "@embodied-agent/core";
import type { MetricsRecorder } from "@embodied-agent/platform";
import type { SttSettingsSlice } from "./stt-settings.js";
import { createAgentRuntimeContext, type AgentRuntimeContext } from "./context.js";

export type AgentSettingsSlice = SttSettingsSlice & {
  deployment_id: string;
  deployment_name?: string;
  llm_model: string;
  llm_thinking?: boolean;
  active_domain?: string;
  domain_configs?: Record<string, unknown>;
};

export type AlertRuleSlice = {
  entity_id?: string;
  metric: string;
  operator: string;
  value: number | string;
  [key: string]: unknown;
};

export type MemoryJournalConfig = {
  commandBackend: "file" | "sqlite";
  sqlitePath?: string;
};

export type FileLockFn = <T>(
  lockPath: string,
  fn: () => T | Promise<T>,
  opts?: { timeoutMs?: number },
) => Promise<T>;

export type AgentRuntimeBindings = {
  getEffectiveSettings: () => AgentSettingsSlice;
  loadRegistry: () => DeviceRegistry;
  getAllTelemetry: () => readonly SceneTelemetrySlice[];
  getSceneMode: (entityId: string) => SceneModeState | null;
  listAlertRules: () => readonly AlertRuleSlice[];
  resolveDeploymentCoordinates: () => { latitude: number; longitude: number };
  fetchWeatherForecast: (latitude: number, longitude: number, hours: number) => Promise<unknown>;
  formatForecastSnippet: (forecast: unknown) => string;
  getIntentSkillEnum: (settings: AgentSettingsSlice) => readonly string[];
  safeParseIntentPayload: (data: unknown, settings: AgentSettingsSlice) => IntentParseResult;
  buildScenePromptSection: (settings: AgentSettingsSlice) => string;
  buildIntentContract: (settings: AgentSettingsSlice) => string;
  buildIntentPromptGuidance: (
    settings: AgentSettingsSlice,
    deploymentTarget: string,
  ) => DomainPackIntentPromptGuidance;
  normalizeUtterance: (text: string, settings: AgentSettingsSlice) => string;
  normalizeLlmShape: (data: unknown, settings: AgentSettingsSlice) => unknown;
  refineIntentFromUtterance: (
    utterance: string,
    intent: IntentPayload,
    settings: AgentSettingsSlice,
  ) => IntentPayload;
  detectSkillUtteranceConflict: (
    utterance: string,
    skill: string,
    settings: AgentSettingsSlice,
  ) => boolean;
  isLowConfidenceControlSkill: (skill: string, settings: AgentSettingsSlice) => boolean;
  buildSceneDeploymentContext: (
    settings: AgentSettingsSlice,
    registry: DeviceRegistry,
  ) => {
    scene_context_sections: string[];
  };
  buildSceneModesSummary?: (
    telemetry: readonly SceneTelemetrySlice[],
    getMode: (entityId: string) => SceneModeState | null,
  ) => string | undefined;
  resolvePrimaryEvalPaths: (
    settings?: Pick<AgentSettingsSlice, "active_domain">,
  ) => DomainPackEvalPaths & { packId: string };
  getMemoryJournalConfig: () => MemoryJournalConfig;
  isSttConfigured: (settings: SttSettingsSlice) => boolean;
  dataRoot: () => string;
  atomicWriteText: (path: string, text: string) => void;
  withFileLock: FileLockFn;
  FileLockBusyError: new (lockPath: string) => Error;
  matrixTimeoutMs: () => number;
  tryStructuralIntentOverride: (
    utterance: string,
    history?: readonly StructuralHistoryTurn[],
  ) => IntentPayload | null;
  refineStructuralIntentFromUtterance: (utterance: string, intent: IntentPayload) => IntentPayload;
  /** 可选指标埋点；未注入时埋点 no-op。 */
  metrics?: MetricsRecorder;
};

/**
 * 组合根便捷构造：将进程级装配产物 bindings 包装为 AgentRuntimeContext。
 * 不再持有任何模块级全局状态；调用方负责显式传递 ctx/bindings。
 */
export function bindAgentRuntime(bindings: AgentRuntimeBindings): AgentRuntimeContext {
  return createAgentRuntimeContext(bindings, bindings.metrics);
}
