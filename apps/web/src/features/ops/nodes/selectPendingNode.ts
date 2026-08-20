import { devicesTemplateForNode } from "../../../nodeBinding";

export function selectPendingNode(
  n: { node_id: string; deployment_id?: string; entity_id?: string },
  packId: string,
  setters: {
    setBindNodeId: (v: string) => void;
    setDeploymentId: (v: string) => void;
    setEntityId: (v: string) => void;
    setBindDevicesJson: (v: string) => void;
    setErr: (v: string | null) => void;
    setMsg: (v: string | null) => void;
  },
  t: (key: string, params?: Record<string, string>) => string,
) {
  setters.setBindNodeId(n.node_id);
  if (n.deployment_id) setters.setDeploymentId(n.deployment_id);
  if (n.entity_id) setters.setEntityId(n.entity_id);
  setters.setBindDevicesJson(JSON.stringify(devicesTemplateForNode(n.node_id, packId), null, 2));
  setters.setErr(null);
  setters.setMsg(t("console.devices.nodeSelected", { node_id: n.node_id }));
}

export function pendingMatchesEntity(
  n: { deployment_id: string; entity_id?: string },
  deploymentId: string,
  entityId: string,
): boolean {
  if (n.deployment_id !== deploymentId) return false;
  if (!entityId) return true;
  return n.entity_id === entityId;
}

/**
 * 节点选中来源：显式状态替代 userPickedNodeRef + lastAutoSelectedRef。
 * - open: 允许 auto-select
 * - manual: 用户手动点选，deployment/entity 变更前不覆盖
 */
export type NodeSelectMode = "open" | "manual";
