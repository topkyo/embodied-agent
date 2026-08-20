import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLlmSkillEnum, safeParseIntentPayload } from "@embodied-agent/core";
import {
  GREENHOUSE_P0_SKILLS,
  GREENHOUSE_P1_SKILLS,
  GREENHOUSE_INTENT_CONTRACT,
  greenhouseIntentSchemas,
  tryStructuralIntentOverride,
  GREENHOUSE_INTENT_PROCESSING,
} from "@embodied-agent/domain-agriculture";
import { type AgentRuntimeBindings } from "../src/runtime-bindings.js";
import {
  atomicWriteText,
  resolveAgentDataDir as dataRoot,
  FileLockBusyError,
  matrixTimeoutMs,
  withFileLock,
} from "@embodied-agent/platform";
import { isSttConfigured } from "../src/stt-settings.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export function bindTestAgentRuntime(
  overrides: Partial<AgentRuntimeBindings> = {},
): AgentRuntimeBindings {
  return {
    getEffectiveSettings: () => ({
      deployment_id: "dep-gh-pilot-001",
      deployment_name: "test",
      llm_provider: "deepseek",
      llm_base_url: "https://api.deepseek.com",
      llm_model: "deepseek-chat",
      stt_provider: "none",
      stt_model: "",
      active_domain: "agriculture",
      domain_configs: {},
    }),
    loadRegistry: () => {
      throw new Error("loadRegistry not stubbed in test bindings");
    },
    getAllTelemetry: () => [],
    getSceneMode: () => null,
    listAlertRules: () => [],
    resolveDeploymentCoordinates: () => ({ latitude: 31.23, longitude: 121.47 }),
    fetchWeatherForecast: async () => ({}),
    formatForecastSnippet: () => "",
    getIntentSkillEnum: () =>
      createLlmSkillEnum([...GREENHOUSE_P0_SKILLS, ...GREENHOUSE_P1_SKILLS]),
    safeParseIntentPayload: (data) => safeParseIntentPayload(data, greenhouseIntentSchemas),
    buildScenePromptSection: () => "",
    buildIntentContract: () => GREENHOUSE_INTENT_CONTRACT,
    buildIntentPromptGuidance: (_settings, deploymentTarget) => ({
      parserPreamble: GREENHOUSE_INTENT_PROCESSING.prompt?.parserPreamble,
      clarificationRule: GREENHOUSE_INTENT_PROCESSING.prompt?.clarificationRule,
      disambiguationRules:
        GREENHOUSE_INTENT_PROCESSING.prompt?.disambiguationRules?.(deploymentTarget),
      examples: GREENHOUSE_INTENT_PROCESSING.prompt?.examples?.(deploymentTarget),
    }),
    normalizeUtterance: (text) =>
      GREENHOUSE_INTENT_PROCESSING.normalizeUtterance?.(text) ?? text.trim(),
    normalizeLlmShape: (data) => GREENHOUSE_INTENT_PROCESSING.normalizeLlmShape?.(data) ?? data,
    refineIntentFromUtterance: (utterance, intent) =>
      GREENHOUSE_INTENT_PROCESSING.refineIntentFromUtterance?.(utterance, intent) ?? intent,
    detectSkillUtteranceConflict: (utterance, skill) =>
      Boolean(GREENHOUSE_INTENT_PROCESSING.detectSkillUtteranceConflict?.(utterance, skill)),
    isLowConfidenceControlSkill: (skill) =>
      Boolean(GREENHOUSE_INTENT_PROCESSING.isLowConfidenceControlSkill?.(skill)),
    buildSceneDeploymentContext: () => ({
      scene_context_sections: ["温室 ID 对照：\n- gh-001: 1号棚、一号棚\n- gh-002: 2号棚、二号棚"],
    }),
    resolvePrimaryEvalPaths: () => ({
      packId: "agriculture",
      golden: resolve(REPO_ROOT, "scenes/greenhouse/eval/intent-golden.zh.jsonl"),
      matrixExtra: resolve(REPO_ROOT, "scenes/greenhouse/eval/sim-matrix-extra.jsonl"),
      matrixWechat: resolve(REPO_ROOT, "scenes/greenhouse/eval/sim-matrix-wechat.jsonl"),
      matrixNegative: resolve(REPO_ROOT, "scenes/greenhouse/eval/sim-matrix-negative.jsonl"),
    }),
    getMemoryJournalConfig: () => ({ commandBackend: "file" }),
    isSttConfigured,
    dataRoot,
    atomicWriteText,
    withFileLock,
    FileLockBusyError,
    matrixTimeoutMs,
    tryStructuralIntentOverride,
    refineStructuralIntentFromUtterance: (utterance, intent) =>
      GREENHOUSE_INTENT_PROCESSING.refineIntentFromUtterance?.(utterance, intent) ?? intent,
    ...overrides,
  };
}
