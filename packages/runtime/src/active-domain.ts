import type {
  DomainPackClarificationHandler,
  DomainPackCommandHooks,
  DomainPackDigest,
  DomainPackModeStore,
  DomainPackNlgConfig,
  DomainPackOutcomeEvaluationInput,
  DomainPackPolicySuggestions,
  DomainPackProactiveAlerts,
  DomainPackScheduledReports,
  DomainPackWeatherProactive,
  DomainPackWeeklyAdvice,
  OutcomeThresholds,
  RiskLevel,
} from "@embodied-agent/core";
import { getContractCapabilityValue } from "./contract.js";
import {
  getConfiguredRuntimeSettings,
  getPrimaryDomainPackContract,
  resolveActiveDomainPackContracts,
} from "./loader.js";
import type { PlatformRuntimeContext } from "./context.js";

function activeContract(ctx: PlatformRuntimeContext) {
  return getPrimaryDomainPackContract(ctx.loader, getConfiguredRuntimeSettings(ctx.loader));
}

export function activeSceneRuntime(ctx: PlatformRuntimeContext) {
  return activeContract(ctx).core.sceneRuntime;
}

export function activeModeStore(ctx: PlatformRuntimeContext): DomainPackModeStore | undefined {
  return getContractCapabilityValue<DomainPackModeStore>(activeContract(ctx), "mode-store");
}

export function activeNlgConfig(ctx: PlatformRuntimeContext): DomainPackNlgConfig | undefined {
  return getContractCapabilityValue<DomainPackNlgConfig>(activeContract(ctx), "nlg");
}

export function activeClarificationHandler(
  ctx: PlatformRuntimeContext,
): DomainPackClarificationHandler | undefined {
  return getContractCapabilityValue<DomainPackClarificationHandler>(
    activeContract(ctx),
    "clarification",
  );
}

export function activePolicySuggestions(
  ctx: PlatformRuntimeContext,
): DomainPackPolicySuggestions | undefined {
  return getContractCapabilityValue<DomainPackPolicySuggestions>(
    activeContract(ctx),
    "policy-suggestions",
  );
}

export function activeCommandHooks(
  ctx: PlatformRuntimeContext,
): DomainPackCommandHooks | undefined {
  return getContractCapabilityValue<DomainPackCommandHooks>(activeContract(ctx), "command-hooks");
}

export function activeDigest(ctx: PlatformRuntimeContext): DomainPackDigest | undefined {
  return getContractCapabilityValue<DomainPackDigest>(activeContract(ctx), "digest");
}

export function activeWeeklyAdvice(
  ctx: PlatformRuntimeContext,
): DomainPackWeeklyAdvice | undefined {
  return getContractCapabilityValue<DomainPackWeeklyAdvice>(activeContract(ctx), "weekly-advice");
}

export function activeWeatherProactive(
  ctx: PlatformRuntimeContext,
): DomainPackWeatherProactive | undefined {
  return getContractCapabilityValue<DomainPackWeatherProactive>(
    activeContract(ctx),
    "weather-proactive",
  );
}

export function activeScheduledReports(ctx: PlatformRuntimeContext): DomainPackScheduledReports {
  const contract = activeContract(ctx);
  const reports = getContractCapabilityValue<DomainPackScheduledReports>(
    contract,
    "scheduled-reports",
  );
  if (!reports) {
    throw new Error(
      `active_domain ${contract.core.manifest.id} 未提供 scheduledReports，不能生成定时汇报`,
    );
  }
  return reports;
}

export function hasActiveProactiveAlerts(ctx: PlatformRuntimeContext): boolean {
  const contract = activeContract(ctx);
  return contract.capabilities.some((capability) => capability.kind === "proactive-alerts");
}

export function hasActiveScheduledReports(ctx: PlatformRuntimeContext): boolean {
  const contract = activeContract(ctx);
  return contract.capabilities.some((capability) => capability.kind === "scheduled-reports");
}

export function hasActiveDigest(ctx: PlatformRuntimeContext): boolean {
  const contract = activeContract(ctx);
  return contract.capabilities.some((capability) => capability.kind === "digest");
}

export function hasActiveWeatherProactive(ctx: PlatformRuntimeContext): boolean {
  const contract = activeContract(ctx);
  return contract.capabilities.some((capability) => capability.kind === "weather-proactive");
}

export function activeProactiveAlerts(ctx: PlatformRuntimeContext): DomainPackProactiveAlerts {
  const contract = activeContract(ctx);
  const alerts = getContractCapabilityValue<DomainPackProactiveAlerts>(
    contract,
    "proactive-alerts",
  );
  if (!alerts) {
    throw new Error(
      `active_domain ${contract.core.manifest.id} 未提供 proactiveAlerts，不能评估持续告警`,
    );
  }
  return alerts;
}

export function riskLevelForScene(
  ctx: PlatformRuntimeContext,
  scene_skill_id: string,
): RiskLevel | undefined {
  return activeSceneRuntime(ctx).riskLevelForScene(scene_skill_id);
}

export function evaluateActiveDomainOutcomeSuccess(
  ctx: PlatformRuntimeContext,
  input: DomainPackOutcomeEvaluationInput,
): boolean {
  return activeSceneRuntime(ctx).evaluateOutcomeSuccess(input);
}

export function riskLevelForPhysicalSkill(
  ctx: PlatformRuntimeContext,
  skill: string,
  opts?: { requires_confirmation?: boolean; scene_skill_id?: string },
): RiskLevel {
  return activeSceneRuntime(ctx).riskLevelForPhysicalSkill(skill, opts);
}

export function outcomeThresholdsForScene(
  ctx: PlatformRuntimeContext,
  scene_skill_id: string,
): OutcomeThresholds {
  return activeSceneRuntime(ctx).outcomeThresholdsForScene(scene_skill_id);
}

export function getSceneMode(ctx: PlatformRuntimeContext, entityId: string) {
  return activeModeStore(ctx)?.getMode(entityId);
}

export function setSceneMode(
  ctx: PlatformRuntimeContext,
  entityId: string,
  userId: string,
  params: Record<string, unknown>,
) {
  const store = activeModeStore(ctx);
  if (!store) {
    throw new Error("当前 Domain Pack 未提供 modeStore");
  }
  return store.setMode(entityId, userId, params);
}

export function resetSceneModesForTests(ctx: PlatformRuntimeContext): void {
  for (const contract of resolveActiveDomainPackContracts(
    ctx.loader,
    getConfiguredRuntimeSettings(ctx.loader),
  )) {
    getContractCapabilityValue<DomainPackModeStore>(contract, "mode-store")?.resetForTests?.();
  }
}
