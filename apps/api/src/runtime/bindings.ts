import { bindAgentRuntime } from "@embodied-agent/agent";
import { bindNodeRuntime, loadRegistry } from "@embodied-agent/node";
import { getEffectiveSettings } from "../settings/store.js";
import { getMetricsRecorder } from "./metrics-holder.js";
import { setAgentRuntimeContext } from "./agent-context.js";
import { getPlatformRuntimeContext } from "./context.js";
import {
  getAllTelemetry,
  getNodeHeartbeat,
  getNodeHeartbeatConfigVersion,
} from "../telemetry/store.js";
import { listAlertRules } from "../alerts/threshold-store.js";
import { configureDomainPackLoader, getPrimaryDomainPackContract } from "../domain-packs/loader.js";
import { getSceneMode } from "@embodied-agent/runtime";
import { resolveDeploymentCoordinates } from "../integrations/weather/coordinates.js";
import { fetchWeatherForecast, formatForecastSnippet } from "../integrations/weather/open-meteo.js";
import {
  buildIntentSkillEnum,
  buildIntentContract,
  buildIntentPromptGuidance,
  buildSceneDeploymentContext,
  buildScenePromptSection,
  resolveActiveDomainPackContracts,
  detectActiveDomainSkillUtteranceConflict,
  isActiveDomainLowConfidenceControlSkill,
  normalizeActiveDomainLlmShape,
  normalizeActiveDomainUtterance,
  refineActiveDomainIntentFromUtterance,
  safeParseActiveIntentPayload,
} from "../domain-packs/loader.js";
import { resolvePrimaryEvalPaths } from "@embodied-agent/runtime";
import { commandStoreBackend, sqlitePath } from "../state/config.js";
import { dataRoot } from "../fs/deployment-path.js";
import { atomicWriteJson, atomicWriteText } from "@embodied-agent/platform";
import { FileLockBusyError, matrixTimeoutMs, withFileLock } from "../fs/file-lock.js";
import { isSttConfigured } from "../settings/stt-provider.js";

export function bindRuntimeLayers(): void {
  const ctx = getPlatformRuntimeContext();
  configureDomainPackLoader(
    ctx.loader,
    {
      storage: { dataRoot, atomicWriteJson },
    },
    ctx.services,
  );

  const metrics = getMetricsRecorder();

  bindNodeRuntime({
    getNodeHeartbeat,
    getNodeHeartbeatConfigVersion,
    metrics,
  });

  const agentCtx = bindAgentRuntime({
    getEffectiveSettings,
    loadRegistry,
    getAllTelemetry: () => {
      const contract = getPrimaryDomainPackContract(ctx.loader, getEffectiveSettings());
      if (!contract.core.context.includeTelemetry) return [];
      return getAllTelemetry().map((t) => ({ ...t, entity_id: t.entity_id }));
    },
    getSceneMode: (entityId) => getSceneMode(ctx, entityId) ?? null,
    listAlertRules: () => {
      const contract = getPrimaryDomainPackContract(ctx.loader, getEffectiveSettings());
      return contract.core.context.includeAlertRules ? listAlertRules() : [];
    },
    resolveDeploymentCoordinates,
    fetchWeatherForecast: (latitude, longitude, hours) =>
      fetchWeatherForecast(latitude, longitude, hours),
    formatForecastSnippet: (forecast) =>
      formatForecastSnippet(forecast as Parameters<typeof formatForecastSnippet>[0]),
    getIntentSkillEnum: (settings) => buildIntentSkillEnum(ctx.loader, settings),
    safeParseIntentPayload: (data, settings) =>
      safeParseActiveIntentPayload(ctx.loader, data, settings),
    buildScenePromptSection: (settings) => buildScenePromptSection(ctx.loader, settings),
    buildIntentContract: (settings) => buildIntentContract(ctx.loader, settings),
    buildIntentPromptGuidance: (settings, deploymentTarget) =>
      buildIntentPromptGuidance(ctx.loader, settings, deploymentTarget),
    normalizeUtterance: (text, settings) =>
      normalizeActiveDomainUtterance(ctx.loader, text, settings),
    normalizeLlmShape: (data, settings) =>
      normalizeActiveDomainLlmShape(ctx.loader, data, settings),
    refineIntentFromUtterance: (utterance, intent, settings) =>
      refineActiveDomainIntentFromUtterance(ctx.loader, utterance, intent, settings),
    detectSkillUtteranceConflict: (utterance, skill, settings) =>
      detectActiveDomainSkillUtteranceConflict(ctx.loader, utterance, skill, settings),
    isLowConfidenceControlSkill: (skill, settings) =>
      isActiveDomainLowConfidenceControlSkill(ctx.loader, skill, settings),
    buildSceneDeploymentContext: (settings, registry) =>
      buildSceneDeploymentContext(ctx.loader, settings, registry),
    buildSceneModesSummary: (telemetry, getMode) => {
      const contract = getPrimaryDomainPackContract(ctx.loader, getEffectiveSettings());
      return contract.core.context.buildModesSummary?.(telemetry, (id) => getMode(id) ?? undefined);
    },
    resolvePrimaryEvalPaths: (settings) => resolvePrimaryEvalPaths(ctx.loader, settings),
    getMemoryJournalConfig: () => ({
      commandBackend: commandStoreBackend(),
      sqlitePath: sqlitePath(),
    }),
    isSttConfigured,
    dataRoot,
    atomicWriteText,
    withFileLock,
    FileLockBusyError,
    matrixTimeoutMs,
    tryStructuralIntentOverride: (utterance, history) => {
      const settings = getEffectiveSettings();
      for (const contract of resolveActiveDomainPackContracts(ctx.loader, getEffectiveSettings())) {
        const result = contract.core.structuralOverrides.tryStructuralIntentOverride?.(
          utterance,
          history,
        );
        if (!result) continue;
        const parsed = safeParseActiveIntentPayload(ctx.loader, result, settings);
        if (parsed.success) return parsed.data;
        return null;
      }
      return null;
    },
    refineStructuralIntentFromUtterance: (utterance, intent) => {
      const settings = getEffectiveSettings();
      let refined = intent;
      for (const contract of resolveActiveDomainPackContracts(ctx.loader, getEffectiveSettings())) {
        const next =
          contract.core.structuralOverrides.refineIntentFromUtterance?.(utterance, refined) ??
          refined;
        const parsed = safeParseActiveIntentPayload(ctx.loader, next, settings);
        refined = parsed.success ? parsed.data : refined;
      }
      return refined;
    },
    metrics,
  });
  setAgentRuntimeContext(agentCtx);
}
