import type { DeviceRegistry, DomainPackContract } from "@embodied-agent/core";
import {
  buildDomainPackOpsSchemaFromContract,
  configureDomainPackLoader as configureRuntimeDomainPackLoader,
  getPrimaryDomainPackContract,
  preloadDomainPacks,
  type DomainPackLoadOptions,
  type DomainPackLoaderHolder,
  type DomainPackRuntimeCatalog,
  type DomainPackRuntimeSettings,
  type PlatformServiceHolder,
  type RuntimeNodeStatus,
} from "@embodied-agent/runtime";
import { getNodeRuntimeStatus } from "../nodes/online-status.js";
import { loadRegistry } from "@embodied-agent/node";
import { getEffectiveSettings } from "../settings/store.js";
import { API_DOMAIN_PACK_RUNTIME_CATALOG } from "./catalog.js";
import "./services.js";

type PlatformHostServiceOptions = {
  loadRegistry: () => DeviceRegistry;
  getNodeRuntimeStatus: (nodeId: string, now?: number, deploymentId?: string) => RuntimeNodeStatus;
  domainServices?: Record<string, unknown>;
  preDispatchServices?: Record<string, unknown>;
  defaultDomainServiceKeys?: readonly string[];
};

type PlatformHostOptions = {
  holder: DomainPackLoaderHolder;
  serviceHolder: PlatformServiceHolder;
  catalog: DomainPackRuntimeCatalog;
  getEffectiveSettings: () => DomainPackRuntimeSettings;
  services: PlatformHostServiceOptions;
  storage?: DomainPackLoadOptions["storage"];
};

export type PlatformHost = {
  getActivePackContract(): DomainPackContract;
  getActiveOpsSchema(): ReturnType<typeof buildDomainPackOpsSchemaFromContract>;
  preloadActivePack(): Promise<void>;
};

function createPlatformHost(options: PlatformHostOptions): PlatformHost {
  configureRuntimeDomainPackLoader(options.holder, {
    catalog: options.catalog,
    getEffectiveSettings: options.getEffectiveSettings,
    storage: options.storage,
  });
  options.serviceHolder.configureRuntimeServices({
    loadRegistry: options.services.loadRegistry,
    getNodeRuntimeStatus: options.services.getNodeRuntimeStatus,
    domainServices: options.services.domainServices,
    preDispatchServices: options.services.preDispatchServices,
    defaultDomainServiceKeys: options.services.defaultDomainServiceKeys,
  });

  const settings = options.getEffectiveSettings;
  return {
    getActivePackContract() {
      return getPrimaryDomainPackContract(options.holder, settings());
    },
    getActiveOpsSchema() {
      return buildDomainPackOpsSchemaFromContract(
        getPrimaryDomainPackContract(options.holder, settings()),
      );
    },
    async preloadActivePack() {
      await preloadDomainPacks(options.holder);
    },
  };
}

export function configureDomainPackLoader(
  holder: DomainPackLoaderHolder,
  options: DomainPackLoadOptions,
  serviceHolder: PlatformServiceHolder,
): void {
  const nextOptions: DomainPackLoadOptions = {
    catalog: API_DOMAIN_PACK_RUNTIME_CATALOG,
    ...options,
    getEffectiveSettings,
  };
  configureRuntimeDomainPackLoader(holder, nextOptions);
  createPlatformHost({
    holder,
    serviceHolder,
    catalog: API_DOMAIN_PACK_RUNTIME_CATALOG,
    getEffectiveSettings,
    services: {
      loadRegistry,
      getNodeRuntimeStatus,
    },
    storage: options.storage,
  });
}

export {
  getDomainPackCatalog,
  getDomainPackManifest,
  activeSceneIntentSchemas,
  activeSceneSkills,
  buildDomainPackOpsSchemaFromContract,
  buildIntentContract,
  buildIntentPromptGuidance,
  buildIntentSkillEnum,
  buildSceneDeploymentContext,
  buildScenePromptSection,
  detectActiveDomainSkillUtteranceConflict,
  domainPackCapabilitiesFromContract,
  evaluateDomainPackReadinessFromContract,
  getConfiguredRuntimeSettings,
  getPrimaryDomainPackContract,
  isActiveDomainLowConfidenceControlSkill,
  normalizeActiveDomainLlmShape,
  normalizeActiveDomainUtterance,
  preloadAllDomainPacksForReadiness,
  preloadDomainPacks,
  refineActiveDomainIntentFromUtterance,
  resolveActiveDomainPackContracts,
  resolveDomainPackContractById,
  resolveDomainPackWebSlug,
  safeParseActiveIntentPayload,
} from "@embodied-agent/runtime";
