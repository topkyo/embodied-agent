import type { PlatformServiceHolder } from "./services.js";
import type { DomainPackLoaderHolder } from "./loader.js";

/**
 * PlatformRuntimeContext：进程级 platform runtime 资源的显式传递容器。
 * 包含 services（PlatformServiceHolder）与 loader（DomainPackLoaderHolder），
 * 替代模块级裸 `let` 单例。
 */
export type PlatformRuntimeContext = {
  services: PlatformServiceHolder;
  loader: DomainPackLoaderHolder;
};

export function createPlatformRuntimeContext(opts: {
  services: PlatformServiceHolder;
  loader: DomainPackLoaderHolder;
}): PlatformRuntimeContext {
  return { services: opts.services, loader: opts.loader };
}
