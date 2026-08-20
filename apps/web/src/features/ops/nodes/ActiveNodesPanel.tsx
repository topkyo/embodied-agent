import type { AdminNode } from "../../../api";
import {
  formatNodeEntityLabel,
  formatNodeTechTitle,
  relativeAgeFromIso,
  relativeAgeLabel,
} from "./format";

export type ActiveNodesPanelProps = {
  activeNodes: AdminNode[];
  t: (key: string, params?: Record<string, string>) => string;
};

/** active 节点列表与在线状态 */
export function ActiveNodesPanel({ activeNodes, t }: ActiveNodesPanelProps) {
  if (activeNodes.length === 0) return null;

  return (
    <div className="u-my-sm u-text-sm">
      <strong>{t("console.devices.activeNodesTitle")}</strong>
      <p className="muted u-text-xs u-mb-xs">{t("console.devices.activeOnlineHelp")}</p>
      <ul className="u-list-plain u-mb-xs">
        {activeNodes.map((n) => {
          const seenLabel = relativeAgeLabel(relativeAgeFromIso(n.reported_at), t);
          const techTitle = formatNodeTechTitle(n);
          return (
            <li key={n.node_id} className="u-mb-xs">
              <div
                className="u-node-row u-flex u-flex-wrap u-items-center u-gap-sm"
                title={techTitle}
              >
                <span className={n.online ? "pill pill--ok" : "pill pill--warn"}>
                  {n.online ? t("console.devices.online") : t("console.devices.offline")}
                </span>
                <span className="u-node-row-main">{formatNodeEntityLabel(n)}</span>
                {seenLabel ? <span className="muted u-text-xs">{seenLabel}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
