export type AdminBindPanelProps = {
  busy: boolean;
  bindNodeId: string;
  bindDevicesJson: string;
  onBindNodeIdChange: (value: string) => void;
  onBindDevicesJsonChange: (value: string) => void;
  onBind: () => void;
  t: (key: string, params?: Record<string, string>) => string;
};

/** admin 绑定表单；JSON 编辑器放 details 默认收起 */
export function AdminBindPanel({
  busy,
  bindNodeId,
  bindDevicesJson,
  onBindNodeIdChange,
  onBindDevicesJsonChange,
  onBind,
  t,
}: AdminBindPanelProps) {
  return (
    <div className="console-bind-section">
      <div className="u-text-sm u-mb-xs console-bind-title">
        {t("console.devices.adminBindTitle")}
      </div>
      {!bindNodeId.trim() ? (
        <p className="muted u-text-xs u-mb-xs">{t("console.devices.bindNeedsNodeId")}</p>
      ) : null}
      <div className="form-grid console-bind-grid">
        <input
          value={bindNodeId}
          onChange={(e) => onBindNodeIdChange(e.target.value)}
          placeholder={t("console.devices.nodeIdPlaceholder")}
        />
        <button
          type="button"
          className="btn primary"
          disabled={busy || !bindNodeId.trim()}
          onClick={onBind}
        >
          {busy ? t("console.devices.binding") : t("console.devices.bindPublish")}
        </button>
      </div>
      <details className="ops-platform-details u-mt-sm">
        <summary className="ops-platform-details-summary">
          {t("console.devices.advancedJson")}
        </summary>
        <p className="muted ops-platform-details-lead">{t("console.devices.devicesJsonHint")}</p>
        <textarea
          value={bindDevicesJson}
          onChange={(e) => onBindDevicesJsonChange(e.target.value)}
          rows={6}
          className="console-bind-json"
        />
      </details>
    </div>
  );
}
