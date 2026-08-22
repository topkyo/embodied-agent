import { loadRegistry } from "@embodied-agent/node";
import { getNodeHeartbeat } from "../telemetry/store.js";
import { currentDeploymentId } from "../fs/deployment-path.js";

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 90_000;

export function heartbeatTimeoutMs(): number {
  const timeoutMs = Number.parseInt(
    process.env.DEVICE_HEARTBEAT_TIMEOUT_MS ?? String(DEFAULT_HEARTBEAT_TIMEOUT_MS),
    10,
  );
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_HEARTBEAT_TIMEOUT_MS;
}

/**
 * 节点是否离线（用于离线报警推送）。
 * 从未上报过心跳的节点视为「未知」而非离线，避免对尚未上线的设备误推离线报警。
 */
export function isNodeOffline(
  node_id: string,
  now = Date.now(),
  deployment_id = currentDeploymentId(),
): boolean {
  const heartbeat = getNodeHeartbeat(node_id, deployment_id);
  if (!heartbeat) return false;
  return now - Date.parse(heartbeat.reported_at) > heartbeatTimeoutMs();
}

export function listNodeIdsForEntity(
  entity_id: string,
  deployment_id = currentDeploymentId(),
): string[] {
  const registry = loadRegistry();
  const ids = new Set<string>();
  for (const n of registry.nodes ?? []) {
    if (n.deployment_id === deployment_id && n.entity_id === entity_id && n.status === "active") {
      ids.add(n.node_id);
    }
  }
  for (const d of registry.devices) {
    if (d.deployment_id === deployment_id && d.entity_id === entity_id && d.node_id) {
      ids.add(d.node_id);
    }
  }
  return [...ids];
}

/**
 * 节点离线或无可用遥测源时，跳过阈值报警（避免 demo/陈旧数据误推）。
 * 与 isNodeOffline 语义不同：无心跳视为无实时遥测源，应跳过阈值评估；
 * 只要任一绑定节点在线，即认为该棚仍有有效遥测输入。
 */
export function shouldSkipThresholdAlertForEntity(
  entity_id: string,
  now = Date.now(),
  deployment_id = currentDeploymentId(),
): boolean {
  const nodeIds = listNodeIdsForEntity(entity_id, deployment_id);
  if (nodeIds.length === 0) return true;

  return nodeIds.every((node_id) => {
    const heartbeat = getNodeHeartbeat(node_id, deployment_id);
    if (!heartbeat) return true;
    return isNodeOffline(node_id, now, deployment_id);
  });
}
