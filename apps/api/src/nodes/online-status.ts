import { isNodeOffline } from "../alerts/node-offline.js";
import { getNodeHeartbeat } from "../telemetry/store.js";
import { currentDeploymentId } from "../fs/deployment-path.js";

export type NodeRuntimeStatus = {
  online: boolean;
  reported_at: string | null;
};

/** 运行时在线态：基于 MQTT heartbeat，与 registry `status: active` 解耦。 */
export function getNodeRuntimeStatus(
  node_id: string,
  now = Date.now(),
  deployment_id = currentDeploymentId(),
): NodeRuntimeStatus {
  const hb = getNodeHeartbeat(node_id, deployment_id);
  const online = Boolean(hb && !isNodeOffline(node_id, now, deployment_id));
  return { online, reported_at: hb?.reported_at ?? null };
}
