import {
  createLlmSkillEnum,
  safeParseIntentPayload,
  type DomainPackIntentPromptGuidance,
  type IntentParseResult,
  type DomainPackContract,
  type DomainPackContractFactory,
  type IntentPayload,
} from "@embodied-agent/core";
import { assertDomainPackConformance } from "@embodied-agent/domain-sdk";

export type DomainPackRuntimeCatalogEntry = {
  id: string;
  module: string;
  displayName: string;
  webSlug: string;
  status: "live" | "placeholder";
};

export type DomainPackRuntimeCatalog = readonly DomainPackRuntimeCatalogEntry[];

export type DomainPackRuntimeSettings = {
  active_domain?: string;
  deployment_id: string;
  domain_configs?: Record<string, unknown>;
};

type RuntimeSettingsProvider = () => DomainPackRuntimeSettings;

function validateDomainPackCatalog(
  catalog: DomainPackRuntimeCatalog,
): readonly DomainPackRuntimeCatalogEntry[] {
  if (!Array.isArray(catalog) || catalog.length === 0) {
    throw new Error("Domain Pack runtime catalog 缺少 packs。");
  }
  const seen = new Set<string>();
  return catalog.map((entry) => {
    if (!entry.id || !entry.module || !entry.displayName || !entry.webSlug) {
      throw new Error("Domain Pack runtime catalog 存在非法 pack entry。");
    }
    if (entry.status !== "live" && entry.status !== "placeholder") {
      throw new Error(`Domain Pack ${entry.id} runtime catalog status 非法。`);
    }
    if (seen.has(entry.id)) {
      throw new Error(`Domain Pack runtime catalog 重复 id：${entry.id}`);
    }
    seen.add(entry.id);
    return {
      id: entry.id,
      module: entry.module,
      displayName: entry.displayName,
      webSlug: entry.webSlug,
      status: entry.status,
    };
  });
}

export type DomainPackLoadOptions = {
  catalog?: DomainPackRuntimeCatalog;
  getEffectiveSettings?: RuntimeSettingsProvider;
  storage?: {
    dataRoot: () => string;
    atomicWriteJson: (path: string, data: unknown) => void;
  };
};

type DomainPackFactoryOptions = Pick<DomainPackLoadOptions, "storage">;

export type DomainPackLoaderHolder = {
  manifest: readonly DomainPackRuntimeCatalogEntry[];
  catalog: readonly Omit<DomainPackRuntimeCatalogEntry, "module">[];
  packModules: Record<string, string>;
  packCatalogById: Map<string, DomainPackRuntimeCatalogEntry>;
  packContractCache: Map<string, DomainPackContract>;
  packFactoryCache: Map<string, DomainPackContractFactory>;
  preloadPromises: Map<string, Promise<void>>;
  loadOptions: DomainPackFactoryOptions;
  runtimeSettingsProvider: RuntimeSettingsProvider;
};

export function createDomainPackLoaderHolder(): DomainPackLoaderHolder {
  return {
    manifest: [],
    catalog: [],
    packModules: {},
    packCatalogById: new Map(),
    packContractCache: new Map(),
    packFactoryCache: new Map(),
    preloadPromises: new Map(),
    loadOptions: {},
    runtimeSettingsProvider: () => {
      throw new Error("runtime settings provider 未配置。");
    },
  };
}

export function getDomainPackManifest(
  holder: DomainPackLoaderHolder,
): readonly DomainPackRuntimeCatalogEntry[] {
  return holder.manifest;
}

/** Web/运维台展示用目录（含未激活的 placeholder pack）。 */
export function getDomainPackCatalog(
  holder: DomainPackLoaderHolder,
): readonly Omit<DomainPackRuntimeCatalogEntry, "module">[] {
  return holder.catalog;
}

export function configureDomainPackCatalog(
  holder: DomainPackLoaderHolder,
  catalog: DomainPackRuntimeCatalog,
): void {
  const manifest = validateDomainPackCatalog(catalog);
  holder.manifest = manifest;
  holder.catalog = manifest.map((entry) => ({
    id: entry.id,
    displayName: entry.displayName,
    webSlug: entry.webSlug,
    status: entry.status,
  }));
  holder.packModules = Object.fromEntries(manifest.map((entry) => [entry.id, entry.module]));
  holder.packCatalogById = new Map(manifest.map((entry) => [entry.id, entry]));
  holder.packContractCache.clear();
  holder.packFactoryCache.clear();
  holder.preloadPromises.clear();
}

function requireConfiguredCatalog(holder: DomainPackLoaderHolder): void {
  if (holder.manifest.length === 0) {
    throw new Error("Domain Pack runtime catalog 未配置。");
  }
}

export function configureDomainPackLoader(
  holder: DomainPackLoaderHolder,
  options: DomainPackLoadOptions,
): void {
  if (options.catalog) configureDomainPackCatalog(holder, options.catalog);
  if (options.getEffectiveSettings) {
    holder.runtimeSettingsProvider = options.getEffectiveSettings;
  }
  holder.loadOptions = { storage: options.storage };
  holder.packContractCache.clear();
  if (!options.catalog) holder.preloadPromises.clear();
}

export function getConfiguredRuntimeSettings(
  holder: DomainPackLoaderHolder,
): DomainPackRuntimeSettings {
  return holder.runtimeSettingsProvider();
}

async function importPackFactory(
  holder: DomainPackLoaderHolder,
  packId: string,
): Promise<DomainPackContractFactory> {
  requireConfiguredCatalog(holder);
  const cached = holder.packFactoryCache.get(packId);
  if (cached) return cached;
  const moduleName = holder.packModules[packId];
  if (!moduleName) {
    throw new Error(`未知 Domain Pack: ${packId}`);
  }
  const mod = (await import(moduleName)) as {
    createDomainPackContract?: DomainPackContractFactory;
  };
  if (typeof mod.createDomainPackContract !== "function") {
    throw new Error(`Domain Pack ${packId} 未导出 createDomainPackContract()`);
  }
  holder.packFactoryCache.set(packId, mod.createDomainPackContract);
  return mod.createDomainPackContract;
}

export type DomainPackPreloadOptions = {
  packIds?: readonly string[];
};

function activePackIds(holder: DomainPackLoaderHolder): readonly string[] {
  const activeDomain = getConfiguredRuntimeSettings(holder).active_domain;
  if (!activeDomain) {
    throw new Error("active_domain 未配置：请在 settings.json 显式设置一个 live Domain Pack id。");
  }
  return [activeDomain];
}

/** 启动时只预加载 active Domain Pack；全量 readiness CLI 必须显式传 packIds。 */
export async function preloadDomainPacks(
  holder: DomainPackLoaderHolder,
  options: DomainPackPreloadOptions = {},
): Promise<void> {
  const packIds = options.packIds ?? activePackIds(holder);
  if (packIds.length === 0) {
    throw new Error("preloadDomainPacks 需要至少一个 Domain Pack id。");
  }
  await Promise.all(
    packIds.map((packId) => {
      const existing = holder.preloadPromises.get(packId);
      if (existing) return existing;
      const promise = importPackFactory(holder, packId).then(() => undefined);
      holder.preloadPromises.set(packId, promise);
      return promise;
    }),
  );
}

export async function preloadAllDomainPacksForReadiness(
  holder: DomainPackLoaderHolder,
): Promise<void> {
  requireConfiguredCatalog(holder);
  await preloadDomainPacks(holder, { packIds: holder.catalog.map((entry) => entry.id) });
}

function loadPackModule(holder: DomainPackLoaderHolder, packId: string): DomainPackContractFactory {
  requireConfiguredCatalog(holder);
  if (!holder.packModules[packId]) {
    throw new Error(`未知 Domain Pack: ${packId}`);
  }
  const factory = holder.packFactoryCache.get(packId);
  if (!factory) {
    throw new Error(
      `Domain Pack ${packId} 未预加载：运行态只预加载 active_domain；显式检查请传 packIds。`,
    );
  }
  return factory;
}

function validateLoadedContract(
  holder: DomainPackLoaderHolder,
  packId: string,
  contract: DomainPackContract,
): void {
  requireConfiguredCatalog(holder);
  const entry = holder.packCatalogById.get(packId);
  if (!entry) {
    throw new Error(`未知 Domain Pack: ${packId}`);
  }
  if (contract.core.manifest.id !== entry.id) {
    throw new Error(
      `Domain Pack catalog/module 不一致：${entry.id} 加载到 ${contract.core.manifest.id}`,
    );
  }
  if (contract.core.manifest.status !== entry.status) {
    throw new Error(
      `Domain Pack ${entry.id} status 不一致：catalog=${entry.status}, module=${contract.core.manifest.status}`,
    );
  }
  if (entry.status === "live") {
    assertDomainPackConformance(contract);
  }
}

function loadDomainPackContract(
  holder: DomainPackLoaderHolder,
  packId: string,
): DomainPackContract {
  const cached = holder.packContractCache.get(packId);
  if (cached) return cached;
  const factory = loadPackModule(holder, packId);
  const contract = factory(
    holder.loadOptions.storage ? { storage: holder.loadOptions.storage } : {},
  );
  validateLoadedContract(holder, packId, contract);
  holder.packContractCache.set(packId, contract);
  return contract;
}

export function resolveDomainPackContractById(
  holder: DomainPackLoaderHolder,
  packId: string,
): DomainPackContract {
  return loadDomainPackContract(holder, packId);
}

export function resolveDomainPackWebSlug(holder: DomainPackLoaderHolder, packId: string): string {
  requireConfiguredCatalog(holder);
  const entry = holder.packCatalogById.get(packId);
  if (!entry?.webSlug) {
    throw new Error(`Domain Pack ${packId} 未在 runtime catalog 配置 webSlug。`);
  }
  return entry.webSlug;
}

export function resolveActiveDomainPackContracts(
  holder: DomainPackLoaderHolder,
  settings: Pick<DomainPackRuntimeSettings, "active_domain">,
): DomainPackContract[] {
  const id = settings.active_domain;
  if (!id) {
    throw new Error("active_domain 未配置：请在 settings.json 显式设置一个 live Domain Pack id。");
  }
  const contract = loadDomainPackContract(holder, id);
  if (contract.core.manifest.status === "placeholder") {
    throw new Error(`active_domain ${id} 是 placeholder Domain Pack，不能作为运行态启用。`);
  }
  return [contract];
}

/** Contract-first 主入口：运行态优先消费 DomainPackContract。 */
export function getPrimaryDomainPackContract(
  holder: DomainPackLoaderHolder,
  settings: Pick<DomainPackRuntimeSettings, "active_domain">,
): DomainPackContract {
  const [contract] = resolveActiveDomainPackContracts(holder, settings);
  if (!contract) {
    throw new Error("active_domain 未解析到可用 Domain Pack contract");
  }
  return contract;
}

export function activeSceneSkills(
  holder: DomainPackLoaderHolder,
  settings: Pick<DomainPackRuntimeSettings, "active_domain">,
): readonly string[] {
  return resolveActiveDomainPackContracts(holder, settings).flatMap((contract) => [
    ...contract.core.skills.p0,
    ...contract.core.skills.p1,
  ]);
}

export function activeSceneIntentSchemas(
  holder: DomainPackLoaderHolder,
  settings: Pick<DomainPackRuntimeSettings, "active_domain">,
) {
  return resolveActiveDomainPackContracts(holder, settings).flatMap((contract) => [
    ...contract.core.intentSchemas,
  ]);
}

export function buildIntentSkillEnum(
  holder: DomainPackLoaderHolder,
  settings: Pick<DomainPackRuntimeSettings, "active_domain">,
): readonly string[] {
  return createLlmSkillEnum(activeSceneSkills(holder, settings));
}

export function safeParseActiveIntentPayload(
  holder: DomainPackLoaderHolder,
  data: unknown,
  settings: Pick<DomainPackRuntimeSettings, "active_domain">,
): IntentParseResult {
  return safeParseIntentPayload(data, activeSceneIntentSchemas(holder, settings));
}

export function buildScenePromptSection(
  holder: DomainPackLoaderHolder,
  settings: Pick<DomainPackRuntimeSettings, "active_domain">,
): string {
  return resolveActiveDomainPackContracts(holder, settings)
    .map((contract) => contract.core.prompt.section.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function buildIntentContract(
  holder: DomainPackLoaderHolder,
  settings: Pick<DomainPackRuntimeSettings, "active_domain">,
): string {
  const contracts = resolveActiveDomainPackContracts(holder, settings).map((contract) => {
    const text = contract.core.prompt.contract.trim();
    if (!text) {
      throw new Error(`Domain Pack ${contract.core.manifest.id} 缺少 intentContract。`);
    }
    return text;
  });
  return contracts.join("\n\n");
}

export function buildIntentPromptGuidance(
  holder: DomainPackLoaderHolder,
  settings: Pick<DomainPackRuntimeSettings, "active_domain">,
  deploymentTarget: string,
): DomainPackIntentPromptGuidance {
  const [contract] = resolveActiveDomainPackContracts(holder, settings);
  const prompt = contract?.core.prompt.processing?.prompt;
  return {
    parserPreamble: prompt?.parserPreamble,
    clarificationRule: prompt?.clarificationRule,
    disambiguationRules: prompt?.disambiguationRules?.(deploymentTarget),
    examples: prompt?.examples?.(deploymentTarget),
  };
}

export function normalizeActiveDomainUtterance(
  holder: DomainPackLoaderHolder,
  text: string,
  settings: Pick<DomainPackRuntimeSettings, "active_domain">,
): string {
  let out = text.trim();
  for (const contract of resolveActiveDomainPackContracts(holder, settings)) {
    out = contract.core.prompt.processing?.normalizeUtterance?.(out) ?? out;
  }
  return out;
}

export function normalizeActiveDomainLlmShape(
  holder: DomainPackLoaderHolder,
  data: unknown,
  settings: Pick<DomainPackRuntimeSettings, "active_domain">,
): unknown {
  let out = data;
  for (const contract of resolveActiveDomainPackContracts(holder, settings)) {
    out = contract.core.prompt.processing?.normalizeLlmShape?.(out) ?? out;
  }
  return out;
}

export function refineActiveDomainIntentFromUtterance(
  holder: DomainPackLoaderHolder,
  utterance: string,
  intent: IntentPayload,
  settings: Pick<DomainPackRuntimeSettings, "active_domain">,
): IntentPayload {
  let refined = intent;
  for (const contract of resolveActiveDomainPackContracts(holder, settings)) {
    refined =
      contract.core.prompt.processing?.refineIntentFromUtterance?.(utterance, refined) ?? refined;
  }
  return refined;
}

export function detectActiveDomainSkillUtteranceConflict(
  holder: DomainPackLoaderHolder,
  utterance: string,
  skill: string,
  settings: Pick<DomainPackRuntimeSettings, "active_domain">,
): boolean {
  return resolveActiveDomainPackContracts(holder, settings).some((contract) =>
    Boolean(contract.core.prompt.processing?.detectSkillUtteranceConflict?.(utterance, skill)),
  );
}

export function isActiveDomainLowConfidenceControlSkill(
  holder: DomainPackLoaderHolder,
  skill: string,
  settings: Pick<DomainPackRuntimeSettings, "active_domain">,
): boolean {
  return resolveActiveDomainPackContracts(holder, settings).some((contract) =>
    Boolean(contract.core.prompt.processing?.isLowConfidenceControlSkill?.(skill)),
  );
}

export function buildSceneDeploymentContext(
  holder: DomainPackLoaderHolder,
  settings: Pick<DomainPackRuntimeSettings, "active_domain" | "deployment_id" | "domain_configs">,
  registry: Parameters<DomainPackContract["core"]["context"]["buildDeploymentContext"]>[0],
): {
  scene_context_sections: string[];
} {
  const sections: string[] = [];
  for (const contract of resolveActiveDomainPackContracts(holder, settings)) {
    const packId = contract.core.manifest.id;
    const ctx = contract.core.context.buildDeploymentContext(
      registry,
      settings.deployment_id,
      settings.domain_configs?.[packId as keyof NonNullable<typeof settings.domain_configs>],
    );
    sections.push(...ctx.scene_context_sections);
  }
  return {
    scene_context_sections: sections,
  };
}
