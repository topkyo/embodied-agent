import type { NodeInstallCode } from "../../../api";
import { Banner } from "../../../components/primitives/Banner";

export type InstallCodePanelProps = {
  isAdmin: boolean;
  busy: boolean;
  deploymentId: string;
  entityId: string;
  codes: NodeInstallCode[];
  entityMismatchCodes: NodeInstallCode[];
  onDeploymentIdChange: (value: string) => void;
  onEntityIdChange: (value: string) => void;
  onIssue: () => void;
  onPairViaMqtt: () => void;
  onRefresh: () => void;
  bindNodeId: string;
  t: (key: string, params?: Record<string, string>) => string;
};

/** 安装码发放、deployment/entity 输入与活跃码展示 */
export function InstallCodePanel({
  isAdmin,
  busy,
  deploymentId,
  entityId,
  codes,
  entityMismatchCodes,
  onDeploymentIdChange,
  onEntityIdChange,
  onIssue,
  onPairViaMqtt,
  onRefresh,
  bindNodeId,
  t,
}: InstallCodePanelProps) {
  return (
    <>
      {entityMismatchCodes.length > 0 && (
        <Banner variant="error">
          {t("console.devices.entityMismatch", {
            targets: entityMismatchCodes.map((c) => c.entity_id).join(", "),
            entityId,
          })}
        </Banner>
      )}

      <div className="u-flex u-gap-sm u-mb-sm u-flex-wrap u-items-center">
        <label className="u-sr-only" htmlFor="ops-node-deployment-id">
          deployment_id
        </label>
        <input
          id="ops-node-deployment-id"
          name="deployment_id"
          value={deploymentId}
          onChange={(e) => onDeploymentIdChange(e.target.value)}
          placeholder="deployment_id"
          autoComplete="off"
          className="u-w-120"
        />
        <label className="u-sr-only" htmlFor="ops-node-entity-id">
          {t("console.devices.entityIdOptional")}
        </label>
        <input
          id="ops-node-entity-id"
          name="entity_id"
          value={entityId}
          onChange={(e) => onEntityIdChange(e.target.value)}
          placeholder={t("console.devices.entityIdOptional")}
          autoComplete="off"
          className="u-w-160"
        />
        {isAdmin && (
          <>
            <button type="button" className="btn" disabled={busy} onClick={onIssue}>
              {busy ? t("bind.code.generating") : t("console.devices.issueInstallCode")}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !bindNodeId.trim()}
              onClick={onPairViaMqtt}
            >
              {t("console.devices.pairViaMqtt")}
            </button>
          </>
        )}
        <button
          type="button"
          className="btn u-muted-soft"
          aria-label={t("console.devices.refresh")}
          onClick={onRefresh}
        >
          {t("console.devices.refresh")}
        </button>
        <span className="muted u-text-xs">{t("console.devices.autoRefresh")}</span>
      </div>

      {codes.length > 0 && (
        <div className="u-text-sm u-mb-sm">
          <strong>{t("console.devices.activeCodes")}:</strong>{" "}
          {codes.map((c, i) => (
            <span
              key={i}
              className={
                c.entity_id === entityId
                  ? "u-code-chip u-code-chip-active"
                  : "u-code-chip u-code-chip-inactive"
              }
            >
              {c.install_code}→{c.entity_id || c.deployment_id}
              {c.entity_id === entityId ? t("console.devices.currentEntity") : ""}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
