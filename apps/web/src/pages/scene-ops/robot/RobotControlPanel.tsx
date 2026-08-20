import { Gamepad2 } from "lucide-react";
import { ConfirmDialog } from "../../../components/ops/ConfirmDialog";
import { Banner } from "../../../components/primitives/Banner";
import { PanelTitle } from "../../../components/primitives/PanelTitle";
import { ROBOT_CONTROL_GROUP_LABEL_KEY } from "./robot-control-helpers";
import { useRobotControl } from "./use-robot-control";
import { RobotLightAudioForm, RobotTaskForm } from "./robot-control-forms";
import type { ControlAction } from "./robot-control-types";

export { resolveRobotControlActions, groupRobotControlActions } from "./robot-control-helpers";

export function RobotControlPanel() {
  const {
    t,
    cfg,
    phase,
    confirmState,
    setConfirmState,
    speakText,
    setSpeakText,
    volume,
    setVolume,
    waypointId,
    setWaypointId,
    missingRobot,
    controlsLocked,
    lockReason,
    busy,
    busyLabel,
    grouped,
    requestAction,
    runCustom,
    onConfirmDialog,
    confirmMessage,
    feedbackBusyLabel,
  } = useRobotControl();

  return (
    <section className="settings-panel">
      <PanelTitle
        icon={<Gamepad2 size={20} aria-hidden />}
        title={t("sceneOps.robot.panel.control.title")}
        text={t("sceneOps.robot.panel.control.text")}
      />

      <div className="robot-control-feedback" aria-live="polite" aria-atomic="true">
        {missingRobot && (
          <Banner variant="error">{t("sceneOps.robot.panel.control.missingRobot")}</Banner>
        )}
        {!missingRobot && controlsLocked && <Banner variant="error">{lockReason}</Banner>}
        {feedbackBusyLabel && <Banner variant="ok">{feedbackBusyLabel}</Banner>}
        {phase.status === "success" && (
          <Banner variant="ok">
            {t("sceneOps.robot.status.success")}: {phase.reply}
          </Banner>
        )}
        {phase.status === "error" && (
          <Banner
            variant="error"
            onRetry={
              phase.retryAction
                ? () => requestAction(phase.retryAction as ControlAction)
                : undefined
            }
            retryLabel={t("sceneOps.common.retry")}
          >
            {phase.message}
          </Banner>
        )}
      </div>

      {grouped.map(({ group, actions: groupActions }) => (
        <div key={group} className="robot-control-group">
          <h3 className="robot-control-group__title">{t(ROBOT_CONTROL_GROUP_LABEL_KEY[group])}</h3>
          <div className="actions robot-actions-bar">
            {groupActions.map((action) => {
              const isRunningThis = busyLabel === action.label;
              const isConfirmPending =
                confirmState?.action.key === action.key ||
                (confirmState?.action.skill === action.skill &&
                  confirmState.action.label === action.label);
              const classNames = [
                "btn",
                action.confirm ? "btn--confirm-risk" : "",
                isConfirmPending ? "btn--confirm-pending" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={action.key}
                  type="button"
                  className={classNames}
                  disabled={busy || controlsLocked}
                  title={
                    controlsLocked
                      ? lockReason
                      : action.confirm
                        ? t("sceneOps.robot.confirm.hint")
                        : undefined
                  }
                  onClick={() => requestAction(action)}
                >
                  {action.icon}
                  {isRunningThis ? t("sceneOps.robot.action.execute") : action.label}
                </button>
              );
            })}
          </div>
          {group === "task" && (
            <RobotTaskForm
              t={t}
              waypointId={waypointId}
              setWaypointId={setWaypointId}
              busy={busy}
              controlsLocked={controlsLocked}
              lockReason={lockReason}
              cfg={cfg}
              runCustom={runCustom}
            />
          )}
          {group === "light_audio" && (
            <RobotLightAudioForm
              t={t}
              speakText={speakText}
              setSpeakText={setSpeakText}
              volume={volume}
              setVolume={setVolume}
              busy={busy}
              controlsLocked={controlsLocked}
              lockReason={lockReason}
              runCustom={runCustom}
            />
          )}
        </div>
      ))}

      {/* schema 为空时 fallback 仍有 light_audio/task 组；若仅 schema 无这些 skill 则单独挂表单 */}
      {!grouped.some((g) => g.group === "task") && (
        <div className="robot-control-group">
          <h3 className="robot-control-group__title">{t("sceneOps.robot.group.task")}</h3>
          <RobotTaskForm
            t={t}
            waypointId={waypointId}
            setWaypointId={setWaypointId}
            busy={busy}
            controlsLocked={controlsLocked}
            lockReason={lockReason}
            cfg={cfg}
            runCustom={runCustom}
          />
        </div>
      )}
      {!grouped.some((g) => g.group === "light_audio") && (
        <div className="robot-control-group">
          <h3 className="robot-control-group__title">{t("sceneOps.robot.group.lightAudio")}</h3>
          <RobotLightAudioForm
            t={t}
            speakText={speakText}
            setSpeakText={setSpeakText}
            volume={volume}
            setVolume={setVolume}
            busy={busy}
            controlsLocked={controlsLocked}
            lockReason={lockReason}
            runCustom={runCustom}
          />
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={t("sceneOps.common.confirmTitle")}
        message={confirmMessage}
        confirmLabel={t("sceneOps.common.confirm")}
        cancelLabel={t("sceneOps.common.cancel")}
        danger={confirmState?.kind === "pre_confirm" ? Boolean(confirmState.action.confirm) : true}
        onConfirm={onConfirmDialog}
        onCancel={() => setConfirmState(null)}
      />
    </section>
  );
}
