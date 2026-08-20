import { resolve } from "node:path";
import { bindAgentRuntime, type AgentRuntimeContext } from "@embodied-agent/agent";
import { bindNodeRuntime, loadRegistry } from "@embodied-agent/node";
import { getEffectiveSettings } from "../../apps/api/src/settings/store.js";
import { getAllTelemetry } from "../../apps/api/src/telemetry/store.js";
import { listAlertRules } from "../../apps/api/src/alerts/threshold-store.js";
import { resolveDeploymentCoordinates } from "../../apps/api/src/integrations/weather/coordinates.js";
import {
  fetchWeatherForecast,
  formatForecastSnippet,
} from "../../apps/api/src/integrations/weather/open-meteo.js";
import {
  buildIntentSkillEnum,
  buildIntentContract,
  buildIntentPromptGuidance,
  buildSceneDeploymentContext,
  buildScenePromptSection,
  configureDomainPackLoader,
  detectActiveDomainSkillUtteranceConflict,
  getPrimaryDomainPackContract,
  isActiveDomainLowConfidenceControlSkill,
  normalizeActiveDomainLlmShape,
  normalizeActiveDomainUtterance,
  preloadDomainPacks,
  refineActiveDomainIntentFromUtterance,
  resolveActiveDomainPackContracts,
  safeParseActiveIntentPayload,
} from "../../apps/api/src/domain-packs/loader.js";
import {
  syncActivePackServicesForContract,
  initPlatformDomainServices,
} from "../../apps/api/src/domain-packs/services.js";
import {
  assertRequiredServices,
  createDomainPackLoaderHolder,
  createPlatformRuntimeContext,
  createPlatformServiceHolder,
  getSceneMode,
  resolvePrimaryEvalPaths,
  type PlatformRuntimeContext,
} from "@embodied-agent/runtime";
import { commandStoreBackend, sqlitePath } from "../../apps/api/src/state/config.js";
import { dataRoot } from "../../apps/api/src/fs/deployment-path.js";
import { atomicWriteJson, atomicWriteText } from "@embodied-agent/platform";
import {
  FileLockBusyError,
  matrixTimeoutMs,
  withFileLock,
} from "../../apps/api/src/fs/file-lock.js";
import { isSttConfigured } from "../../apps/api/src/settings/stt-provider.js";
import {
  getNodeHeartbeat,
  getNodeHeartbeatConfigVersion,
} from "../../apps/api/src/telemetry/store.js";
import { setPlatformRuntimeContext } from "../../apps/api/src/runtime/context.js";
import { setAgentRuntimeContext } from "../../apps/api/src/runtime/agent-context.js";

let bound = false;
let scriptCtx: PlatformRuntimeContext | null = null;
let scriptAgentCtx: AgentRuntimeContext | null = null;

export function getScriptAgentRuntimeContext(): AgentRuntimeContext {
  if (!scriptAgentCtx) {
    throw new Error("script AgentRuntimeContext 未初始化：请先调用 bindScriptRuntime。");
  }
  return scriptAgentCtx;
}

export function getScriptPlatformRuntimeContext(): PlatformRuntimeContext {
  if (!scriptCtx) {
    throw new Error("script PlatformRuntimeContext 未初始化：请先调用 bindScriptRuntime。");
  }
  return scriptCtx;
}

function ensureScriptAgentDataDir(): void {
  if (process.env.AGENT_DATA_DIR?.trim()) return;
  process.env.AGENT_DATA_DIR = resolve(import.meta.dirname, "../fixtures/ci-eval");
}

export async function bindScriptRuntime(): Promise<void> {
  if (bound) {
    // 幂等路径也重新 enter 两层 context：vitest 共享进程下 ALS 可能已被其他
    // 测试文件或 async 边界改写，仅靠首次绑定不保证当前调用方可见。
    if (scriptCtx) setPlatformRuntimeContext(scriptCtx);
    if (scriptAgentCtx) setAgentRuntimeContext(scriptAgentCtx);
    return;
  }

  try {
    ensureScriptAgentDataDir();
    const holder = createPlatformServiceHolder();
    const loaderHolder = createDomainPackLoaderHolder();
    scriptCtx = createPlatformRuntimeContext({ services: holder, loader: loaderHolder });
    setPlatformRuntimeContext(scriptCtx);
    initPlatformDomainServices(scriptCtx);
    configureDomainPackLoader(
      scriptCtx.loader,
      {
        storage: { dataRoot, atomicWriteJson },
      },
      scriptCtx.services,
    );
    await preloadDomainPacks(scriptCtx.loader);
    const settings = getEffectiveSettings();
    if (!settings.active_domain) {
      throw new Error("active_domain 未配置：脚本 runtime 无法同步 pack-bound services。");
    }
    syncActivePackServicesForContract(
      scriptCtx,
      settings.active_domain,
      getPrimaryDomainPackContract(scriptCtx.loader, settings),
    );
    const missing = assertRequiredServices(
      scriptCtx.services,
      getPrimaryDomainPackContract(scriptCtx.loader, settings),
    );
    if (missing.length > 0) {
      throw new Error(
        `active Domain Pack 缺少必需平台服务：${missing.map((issue) => issue.message).join("; ")}`,
      );
    }

    bindNodeRuntime({
      getNodeHeartbeat,
      getNodeHeartbeatConfigVersion,
    });

    const ctx = scriptCtx;
    const agentCtx = bindAgentRuntime({
      getEffectiveSettings,
      loadRegistry,
      getAllTelemetry: () => {
        const contract = getPrimaryDomainPackContract(ctx.loader, getEffectiveSettings());
        if (!contract.core.context.includeTelemetry) return [];
        return getAllTelemetry().map((t) => ({
          entity_id: t.entity_id,
          greenhouse_id: t.entity_id,
        }));
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
        return contract.core.context.buildModesSummary?.(
          telemetry,
          (id) => getMode(id) ?? undefined,
        );
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
        for (const contract of resolveActiveDomainPackContracts(
          ctx.loader,
          getEffectiveSettings(),
        )) {
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
        for (const contract of resolveActiveDomainPackContracts(
          ctx.loader,
          getEffectiveSettings(),
        )) {
          const next =
            contract.core.structuralOverrides.refineIntentFromUtterance?.(utterance, refined) ??
            refined;
          const parsed = safeParseActiveIntentPayload(ctx.loader, next, settings);
          refined = parsed.success ? parsed.data : refined;
        }
        return refined;
      },
    });
    setAgentRuntimeContext(agentCtx);
    scriptAgentCtx = agentCtx;
    bound = true;
  } catch (error) {
    bound = false;
    scriptAgentCtx = null;
    throw error;
  }
}
