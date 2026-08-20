import { useState } from "react";
import { Boxes, Gamepad2, RefreshCw, Settings2 } from "lucide-react";
import { AdminFetchError, executeDomainControlAction } from "../../api";
import { PanelTitle } from "../../components/primitives/PanelTitle";
import { useActiveOpsSchema } from "../../contexts/DomainPackContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useSceneOpsReadiness } from "../../contexts/SceneOpsReadinessContext";

function fieldValue(items: readonly string[], t: (key: string) => string): string {
  return items.length > 0 ? items.join(", ") : t("sceneOps.schema.none");
}

/** 再导出，便于旧 import 路径继续使用 */
export { useActiveOpsSchema } from "../../contexts/DomainPackContext";

export function DomainPackOpsSchemaPanel() {
  const { t } = useLanguage();
  const { schema, error, loading, reload } = useActiveOpsSchema();

  return (
    <section className="settings-panel">
      <PanelTitle
        icon={<Boxes size={20} aria-hidden />}
        title={t("sceneOps.schema.opsTitle")}
        text={t("sceneOps.schema.opsLead")}
      />
      <div className="settings-actions settings-actions-flush">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void reload()}
          disabled={loading}
        >
          <RefreshCw size={16} aria-hidden />
          {loading ? t("sceneOps.schema.refreshing") : t("sceneOps.schema.refresh")}
        </button>
      </div>
      {error && <p className="muted">{t("console.schema.opsError", { error })}</p>}
      {!loading && !error && !schema && <p className="muted">{t("sceneOps.schema.noOpsSchema")}</p>}
      {schema && (
        <>
          <div className="readiness-summary">
            <div>
              <span>{t("sceneOps.schema.row.pack")}</span>
              <strong>
                {schema.pack_id} · v{schema.schema_version}
              </strong>
            </div>
            <div>
              <span>{t("sceneOps.schema.row.transport")}</span>
              <strong>{fieldValue(schema.devices.binding.required_transports, t)}</strong>
            </div>
            <div>
              <span>{t("sceneOps.schema.row.physicalSkills")}</span>
              <strong>{schema.devices.binding.physical_skills.length}</strong>
            </div>
            <div>
              <span>{t("sceneOps.schema.row.actions")}</span>
              <strong>{schema.control.actions.length}</strong>
            </div>
          </div>
          <table className="ops-table readiness-pack-table">
            <thead>
              <tr>
                <th>{t("sceneOps.schema.col.surface")}</th>
                <th>{t("sceneOps.schema.col.schema")}</th>
                <th>{t("sceneOps.schema.col.status")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t("sceneOps.schema.surface.navigation")}</td>
                <td>
                  {schema.navigation.tabs
                    .filter((tab) => tab.enabled)
                    .map((tab) => tab.id)
                    .join(", ")}
                </td>
                <td>
                  {schema.navigation.tabs.filter((tab) => tab.enabled).length}/
                  {schema.navigation.tabs.length} enabled
                </td>
              </tr>
              <tr>
                <td>{t("sceneOps.schema.surface.settings")}</td>
                <td>
                  {schema.settings.fields.map((field) => `${field.id}:${field.control}`).join(", ")}
                </td>
                <td>{schema.settings.fields.filter((field) => field.required).length} required</td>
              </tr>
              <tr>
                <td>{t("sceneOps.schema.surface.control")}</td>
                <td>{schema.control.actions.map((action) => action.skill).join(", ") || "none"}</td>
                <td>
                  {schema.control.actions.filter((action) => action.requires_confirmation).length}{" "}
                  confirm
                </td>
              </tr>
              <tr>
                <td>{t("sceneOps.schema.surface.devices")}</td>
                <td>nodes: {fieldValue(schema.devices.binding.required_nodes, t)}</td>
                <td>transports: {fieldValue(schema.devices.binding.required_transports, t)}</td>
              </tr>
              <tr>
                <td>{t("sceneOps.schema.surface.evalEvidence")}</td>
                <td>{schema.eval_evidence.slices.map((slice) => slice.id).join(", ")}</td>
                <td>{schema.eval_evidence.slices.length} slices</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

export function DomainPackSettingsSchemaPanel() {
  const { t } = useLanguage();
  const { schema, error, loading } = useActiveOpsSchema();

  return (
    <section className="settings-panel">
      <PanelTitle
        icon={<Settings2 size={20} aria-hidden />}
        title={t("sceneOps.schema.settingsTitle")}
        text={t("sceneOps.schema.settingsLead")}
      />
      {loading && <p className="muted">{t("common.loading")}</p>}
      {error && <p className="muted">{t("console.schema.settingsError", { error })}</p>}
      {!loading && !error && !schema && (
        <p className="muted">{t("sceneOps.schema.noSettingsSchema")}</p>
      )}
      {schema && (
        <table className="ops-table readiness-pack-table">
          <thead>
            <tr>
              <th>{t("sceneOps.schema.col.field")}</th>
              <th>{t("sceneOps.schema.col.control")}</th>
              <th>{t("sceneOps.schema.col.target")}</th>
            </tr>
          </thead>
          <tbody>
            {schema.settings.fields.map((field) => (
              <tr key={field.id}>
                <td>{field.id}</td>
                <td>
                  {field.type}/{field.control}
                  {field.required ? ` · ${t("sceneOps.schema.required")}` : ""}
                </td>
                <td>{field.save_target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function DomainPackControlActionsPanel() {
  const { t } = useLanguage();
  const { schema, error, loading, reload } = useActiveOpsSchema();
  const {
    ready,
    blocked,
    blockingIssue,
    loading: readinessLoading,
    error: readinessError,
  } = useSceneOpsReadiness();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [lastCommand, setLastCommand] = useState<{
    command_id?: string;
    execution_transport?: string;
    lifecycle_state?: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const controlsLocked = !ready;
  const lockReason = blocked
    ? (blockingIssue?.detail ?? blockingIssue?.label ?? t("sceneOps.readiness.blockedHint"))
    : readinessLoading
      ? t("sceneOps.control.readinessChecking")
      : (readinessError ?? t("sceneOps.control.readinessUnavailableShort"));
  const runAction = async (actionId: string, confirmed = false) => {
    setBusyId(actionId);
    setActionError(null);
    setReply(null);
    setLastCommand(null);
    try {
      const result = await executeDomainControlAction({ action_id: actionId, confirmed });
      setReply(result.reply);
      setLastCommand({
        command_id: result.command_id,
        execution_transport: result.execution_transport,
        lifecycle_state: result.lifecycle_state,
      });
    } catch (e) {
      if (e instanceof AdminFetchError && e.status === 409) {
        const reason = typeof e.body.reason === "string" ? e.body.reason : "该操作需要二次确认。";
        const summary = typeof e.body.summary === "string" ? e.body.summary : actionId;
        if (window.confirm(`${reason}\n将执行：${summary}\n确认继续？`)) {
          await runAction(actionId, true);
          return;
        }
        setReply(reason);
      } else {
        setActionError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="settings-panel">
      <PanelTitle
        icon={<Gamepad2 size={20} aria-hidden />}
        title={t("sceneOps.schema.controlTitle")}
        text={t("sceneOps.schema.controlLead")}
      />
      <div className="settings-actions settings-actions-flush">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void reload()}
          disabled={loading}
        >
          <RefreshCw size={16} aria-hidden />
          {t("sceneOps.schema.refresh")}
        </button>
      </div>
      {loading && <p className="muted">{t("common.loading")}</p>}
      {error && <p className="muted">{t("console.schema.controlError", { error })}</p>}
      {actionError && (
        <p className="muted">{t("sceneOps.schema.actionFailed", { error: actionError })}</p>
      )}
      {reply && <p className="muted">{reply}</p>}
      {lastCommand?.command_id && (
        <p className="muted">
          command_id: {lastCommand.command_id} · {lastCommand.lifecycle_state ?? "unknown"} ·{" "}
          {lastCommand.execution_transport ?? "unknown"}
        </p>
      )}
      {!loading && !error && !schema && (
        <p className="muted">{t("sceneOps.schema.noControlSchema")}</p>
      )}
      {schema && schema.control.actions.length === 0 && (
        <p className="muted">{t("sceneOps.schema.noControlActions")}</p>
      )}
      {schema && schema.control.actions.length > 0 && (
        <div className="actions actions-wrap">
          {schema.control.actions.map((action) => {
            const badges = [
              action.physical ? "physical" : null,
              action.requires_confirmation ? "confirm" : null,
            ].filter(Boolean);
            return (
              <button
                key={action.id}
                type="button"
                className="btn btn-primary"
                disabled={busyId === action.id || controlsLocked}
                title={controlsLocked ? lockReason : badges.join(" / ") || undefined}
                onClick={() => void runAction(action.id)}
              >
                {busyId === action.id
                  ? t("sceneOps.schema.executing")
                  : `${action.label}${badges.length ? ` (${badges.join(" / ")})` : ""}`}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
