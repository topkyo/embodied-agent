import { AsyncLocalStorage } from "node:async_hooks";
import {
  createDomainPackLoaderHolder,
  createPlatformRuntimeContext,
  createPlatformServiceHolder,
  type PlatformRuntimeContext,
} from "@embodied-agent/runtime";

/**
 * apps/api 进程级 PlatformRuntimeContext 实例管理（基于 AsyncLocalStorage）。
 * initRuntime / vitest-setup / 脚本装配层通过 setPlatformRuntimeContext 或
 * createAndSetPlatformRuntimeContext 写入当前 async 上下文；路由 handler 与
 * skill handler 通过 getPlatformRuntimeContext 在同一 async 链路中读取 ctx。
 */
const runtimeContextVar = new AsyncLocalStorage<PlatformRuntimeContext>();

export function getPlatformRuntimeContext(): PlatformRuntimeContext {
  const ctx = runtimeContextVar.getStore();
  if (!ctx) {
    throw new Error(
      "PlatformRuntimeContext 未设置：请在装配层调用 setPlatformRuntimeContext 或 runWithPlatformRuntimeContext。",
    );
  }
  return ctx;
}

/** @internal tests — 返回当前 ctx 或 null，不抛错。 */
export function getPlatformRuntimeContextIfExists(): PlatformRuntimeContext | null {
  return runtimeContextVar.getStore() ?? null;
}

/** 装配层/测试/job 用：在 ctx 作用域内执行回调。 */
export function runWithPlatformRuntimeContext<T>(ctx: PlatformRuntimeContext, fn: () => T): T {
  return runtimeContextVar.run(ctx, fn);
}

/** 装配层用：设置 ctx（用于非回调场景，如 init/bootstrap/测试 beforeEach）。 */
export function setPlatformRuntimeContext(ctx: PlatformRuntimeContext): void {
  runtimeContextVar.enterWith(ctx);
}

/** 装配层便捷入口：创建并设置 PlatformRuntimeContext。 */
export function createAndSetPlatformRuntimeContext(): PlatformRuntimeContext {
  const services = createPlatformServiceHolder();
  const loader = createDomainPackLoaderHolder();
  const ctx = createPlatformRuntimeContext({ services, loader });
  setPlatformRuntimeContext(ctx);
  return ctx;
}
