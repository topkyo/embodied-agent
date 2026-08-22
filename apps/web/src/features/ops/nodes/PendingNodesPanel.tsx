import type { AdminNode, NodeInstallCode } from "../../../api";
import { pendingMatchesEntity } from "./selectPendingNode";

export type PendingNodesPanelProps = {
  nodes: AdminNode[];
  codesForCurrentEntity: NodeInstallCode[];
  deploymentId: string;
  entityId: string;
  bindNodeId: string;
  pendingForCurrentEntity: AdminNode[];
  onSelectNode: (n: AdminNode) => void;
  t: (key: string, params?: Record<string, string>) => string;
};

/** pending 节点列表；自动选中逻辑由编排容器负责 */
export function PendingNodesPanel({
  nodes,
  codesForCurrentEntity,
  deploymentId,
  entityId,
  bindNodeId,
  pendingForCurrentEntity,
  onSelectNode,
  t,
}: PendingNodesPanelProps) {
  return (
    <div className="u-my-sm">
      <label className="u-text-sm u-block u-mb-xs">{t("console.devices.pendingNodes")}</label>
      {nodes.length === 0 ? (
        <span className="muted u-text-sm">
          {codesForCurrentEntity.length > 0
            ? t("console.devices.pendingWaitRegister")
            : t("console.devices.pendingIssueFirst")}
        </span>
      ) : (
        <ul className="u-text-sm u-list-plain">
          {nodes.map((n, i) => (
            <li key={i} className="u-mb-xs">
              <button
                type="button"
                className={`btn u-node-pick-btn${bindNodeId === n.node_id ? " is-selected" : ""}${pendingMatchesEntity(n, deploymentId, entityId) ? "" : " u-code-chip-inactive"}`}
                onClick={() => onSelectNode(n)}
              >
                {n.node_id} ({n.deployment_id}/{n.entity_id}) — {n.status}
                {n.firmware_version ? ` fw:${n.firmware_version}` : ""}
                {bindNodeId === n.node_id ? t("console.devices.selectedMarker") : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
      {pendingForCurrentEntity.length === 1 &&
        bindNodeId === pendingForCurrentEntity[0]?.node_id && (
          <div className="u-hint-ok">{t("console.devices.autoSelectedPending")}</div>
        )}
      <div className="u-hint-muted">{t("console.devices.clickPendingHint")}</div>
    </div>
  );
}
