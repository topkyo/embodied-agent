import {
  createMetricsRegistry,
  type MetricsRecorder,
  type MetricsRegistry,
} from "@embodied-agent/platform";

/**
 * 进程级 metrics registry 持有者。
 *
 * 在 `initRuntime` 时创建并注入到 agent/node runtime bindings，
 * 供 /metrics 端点与 apps/api 内部 command 埋点共享同一实例。
 *
 * 这是纯观测性 holder，不承载任何 domain/路由状态，不增加 D1 重构负担；
 * 与既有 `runtimeInitPromise` holder 同构。
 */
type MetricsInstance = MetricsRegistry & MetricsRecorder;

let registry: MetricsInstance | null = null;

export function getMetricsRegistry(): MetricsInstance {
  if (!registry) registry = createMetricsRegistry();
  return registry;
}

/** 返回 metrics recorder 视图（用于注入 runtime bindings）。 */
export function getMetricsRecorder(): MetricsRecorder {
  return getMetricsRegistry();
}

/** @internal tests */
export function resetMetricsRegistryForTest(): void {
  registry = null;
}
