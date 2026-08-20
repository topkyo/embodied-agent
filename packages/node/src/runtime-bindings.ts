import { createServiceLocator } from "@embodied-agent/core";
import type { MetricsRecorder } from "@embodied-agent/platform";

export type NodeHeartbeat = {
  node_id: string;
  reported_at: string;
  config_version?: number;
};

export type NodeRuntimeBindings = {
  getNodeHeartbeat: (node_id: string) => NodeHeartbeat | undefined;
  getNodeHeartbeatConfigVersion: (node_id: string) => number | undefined;
  /** 可选指标埋点；未注入时埋点 no-op。 */
  metrics?: MetricsRecorder;
};

const locator = createServiceLocator<NodeRuntimeBindings>("bindNodeRuntime()");

export function bindNodeRuntime(next: NodeRuntimeBindings): void {
  locator.bind(next);
}

export function getNodeRuntimeBindings(): NodeRuntimeBindings {
  return locator.get();
}

/** @internal tests */
export function resetNodeRuntimeBindingsForTest(): void {
  locator.resetForTest();
}
