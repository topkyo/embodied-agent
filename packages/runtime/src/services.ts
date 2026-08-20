import type {
  DeviceRegistry,
  DomainPackContract,
  DomainPackReadinessIssue,
} from "@embodied-agent/core";

export type RuntimeNodeStatus = {
  online: boolean;
  reported_at: string | null;
};

export type PlatformRuntimeServices = {
  loadRegistry?: () => DeviceRegistry;
  getNodeRuntimeStatus?: (nodeId: string, now?: number, deploymentId?: string) => RuntimeNodeStatus;
  domainServices?: Record<string, unknown>;
  preDispatchServices?: Record<string, unknown>;
  defaultDomainServiceKeys?: readonly string[];
};

const DEFAULT_DOMAIN_SERVICE_KEYS = ["commands", "deviceRegistry"] as const;

/**
 * Platform service holder：将进程级 platform runtime 资源状态封装为实例，
 * 替代模块级裸 `let`/`const` 单例。catalog 与 runtime services 均为进程级资源
 * （非 per-deployment 状态），因此采用 holder 模式而非 context 传递。
 *
 * holder 内部维护两组状态：
 * - catalog：baseCatalog（configure 设置）/ activeCatalog（syncActive 合并后）/ packBoundRegistry（per-pack bound service）
 * - runtimeServices：loadRegistry / getNodeRuntimeStatus / preDispatchServices（partial merge，不清未传字段）
 *
 * holder.configure 只配 catalog 切片；holder.configureRuntimeServices 配 runtime services 字段。
 * 两者职责分离，避免 catalog 重置误清 runtime services。
 */
export type PlatformServiceHolder = {
  // catalog（domainServices）
  configure(catalog: Record<string, unknown>): void;
  getCatalog(): Record<string, unknown>;
  getActiveCatalog(): Record<string, unknown>;
  hasCatalog(): boolean;
  registerPackBound(packId: string, bound: Record<string, unknown>): void;
  getPackBound(packId: string): Record<string, unknown>;
  syncActive(packId: string): void;
  // runtime services（loadRegistry / getNodeRuntimeStatus / preDispatchServices）
  configureRuntimeServices(options: PlatformRuntimeServices): void;
  getLoadRegistry(): () => DeviceRegistry;
  getNodeRuntimeStatus(): (
    nodeId: string,
    now?: number,
    deploymentId?: string,
  ) => RuntimeNodeStatus;
  getPreDispatchServices(): Record<string, unknown>;
  reset(): void;
};

export function createPlatformServiceHolder(): PlatformServiceHolder {
  let baseCatalog: Record<string, unknown> | null = null;
  let activeCatalog: Record<string, unknown> | null = null;
  const packBoundRegistry = new Map<string, Record<string, unknown>>();
  const runtimeServices: PlatformRuntimeServices = {};

  function mergeRuntimeServices(options: PlatformRuntimeServices): void {
    for (const [key, value] of Object.entries(options) as Array<
      [keyof PlatformRuntimeServices, PlatformRuntimeServices[keyof PlatformRuntimeServices]]
    >) {
      if (value !== undefined) {
        (runtimeServices as Record<string, unknown>)[key] = value;
      }
    }
  }

  return {
    configure(next: Record<string, unknown>): void {
      baseCatalog = next;
      activeCatalog = next;
    },
    getCatalog(): Record<string, unknown> {
      if (!baseCatalog) {
        throw new Error("platform domain service catalog 未初始化。");
      }
      return baseCatalog;
    },
    getActiveCatalog(): Record<string, unknown> {
      if (!activeCatalog) {
        throw new Error("platform domain service catalog 未初始化。");
      }
      return activeCatalog;
    },
    hasCatalog(): boolean {
      return baseCatalog !== null;
    },
    registerPackBound(packId: string, bound: Record<string, unknown>): void {
      packBoundRegistry.set(packId, bound);
    },
    getPackBound(packId: string): Record<string, unknown> {
      // pack 未注册 bound service 是合法设计（pack 可不声明 requiredServices，如 industrial 走 MQTT lifecycle）。
      // 返回空对象是合法空集语义，非隐式兜底。未注册 packId 的校验由 loader 层 preload + register 路径保证。
      return packBoundRegistry.get(packId) ?? {};
    },
    syncActive(packId: string): void {
      if (!baseCatalog) {
        throw new Error("platform domain service catalog 未初始化。");
      }
      activeCatalog = { ...baseCatalog, ...(packBoundRegistry.get(packId) ?? {}) };
    },
    configureRuntimeServices(options: PlatformRuntimeServices): void {
      mergeRuntimeServices(options);
    },
    getLoadRegistry(): () => DeviceRegistry {
      if (!runtimeServices.loadRegistry) {
        throw new Error("platform runtime service loadRegistry 未配置。");
      }
      return runtimeServices.loadRegistry;
    },
    getNodeRuntimeStatus(): (
      nodeId: string,
      now?: number,
      deploymentId?: string,
    ) => RuntimeNodeStatus {
      if (!runtimeServices.getNodeRuntimeStatus) {
        throw new Error("platform runtime service getNodeRuntimeStatus 未配置。");
      }
      return runtimeServices.getNodeRuntimeStatus;
    },
    getPreDispatchServices(): Record<string, unknown> {
      if (!runtimeServices.preDispatchServices) {
        throw new Error("platform runtime service preDispatchServices 未配置。");
      }
      return runtimeServices.preDispatchServices;
    },
    reset(): void {
      baseCatalog = null;
      activeCatalog = null;
      packBoundRegistry.clear();
      for (const key of Object.keys(runtimeServices)) {
        delete (runtimeServices as Record<string, unknown>)[key];
      }
    },
  };
}

export function pickPlatformDomainServices(
  holder: PlatformServiceHolder,
  serviceKeys: readonly string[] = [],
): Record<string, unknown> {
  const catalog = holder.getActiveCatalog();
  const selected: Record<string, unknown> = {};
  for (const key of [...DEFAULT_DOMAIN_SERVICE_KEYS, ...serviceKeys]) {
    if (!(key in catalog)) {
      throw new Error(`Domain Pack 请求了未知平台服务：${key}`);
    }
    selected[key] = catalog[key];
  }
  return selected;
}

export function registerPackBoundDomainServices(
  holder: PlatformServiceHolder,
  packId: string,
  boundServices: Record<string, unknown>,
): void {
  holder.registerPackBound(packId, boundServices);
}

export function collectRequiredServiceKeys(contract: DomainPackContract): string[] {
  const keys = new Set<string>();
  for (const capability of contract.capabilities) {
    for (const key of capability.requiredServices ?? []) {
      keys.add(key);
    }
  }
  return [...keys].sort();
}

function missingRequiredServiceIssues(
  contract: DomainPackContract,
  catalog: Record<string, unknown>,
): DomainPackReadinessIssue[] {
  const missing = collectRequiredServiceKeys(contract).filter((key) => !(key in catalog));
  return missing.map((key) => ({
    code: "missing_required_service",
    message: `Domain Pack 声明了未注册平台服务：${key}`,
    severity: "error" as const,
  }));
}

export function resolvePackDomainServices(
  holder: PlatformServiceHolder,
  packId: string,
): Record<string, unknown> {
  return {
    ...holder.getCatalog(),
    ...holder.getPackBound(packId),
  };
}

export function assertRequiredServicesForPack(
  holder: PlatformServiceHolder,
  contract: DomainPackContract,
  packId: string,
): DomainPackReadinessIssue[] {
  return missingRequiredServiceIssues(contract, resolvePackDomainServices(holder, packId));
}

export function assertRequiredServices(
  holder: PlatformServiceHolder,
  contract: DomainPackContract,
): DomainPackReadinessIssue[] {
  return missingRequiredServiceIssues(contract, holder.getActiveCatalog());
}

export function syncActivePackBoundDomainServices(
  holder: PlatformServiceHolder,
  activePackId: string,
): void {
  holder.syncActive(activePackId);
}

export function configurePlatformDomainServiceCatalog(
  holder: PlatformServiceHolder,
  catalog: Record<string, unknown>,
): void {
  holder.configure(catalog);
}
