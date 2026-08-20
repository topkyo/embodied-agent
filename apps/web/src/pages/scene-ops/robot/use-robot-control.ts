import { useEffect, useMemo, useState } from "react";
import {
  AdminFetchError,
  executeRobotIntent,
  fetchRobotConfig,
  type RobotConfig,
} from "../../../api";
import { useOpsSchema } from "../../../contexts/DomainPackContext";
import { useLanguage } from "../../../contexts/LanguageContext";
import { useSceneOpsReadiness } from "../../../contexts/SceneOpsReadinessContext";
import {
  groupForRobotSkill,
  iconForRobotSkill,
  type RobotControlGroupId,
} from "./control-actions";
import { makeIntent } from "./shared";
import {
  groupRobotControlActions,
  resolveRobotControlActions,
  renderIcon,
} from "./robot-control-helpers";
import type { ControlAction, ConfirmState, FeedbackPhase, SchemaControlAction } from "./robot-control-types";

export function useRobotControl() {
  const { t, lang } = useLanguage();
  const opsSchema = useOpsSchema();
  const [cfg, setCfg] = useState<RobotConfig | null>(null);
  const [phase, setPhase] = useState<FeedbackPhase>({ status: "idle" });
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const {
    ready,
    blocked,
    blockingIssue,
    loading: readinessLoading,
    error: readinessError,
  } = useSceneOpsReadiness();
  const [speakText, setSpeakText] = useState(t("sceneOps.robot.field.speakDefault"));
  const [volume, setVolume] = useState(60);
  const [waypointId, setWaypointId] = useState("");

  const robotId = cfg?.default_robot_id || undefined;
  const missingRobot = Boolean(cfg) && !robotId;
  const controlsLocked = !cfg || !ready || !robotId;
  const lockReason = !cfg
    ? t("sceneOps.common.loading")
    : !robotId
      ? t("sceneOps.robot.panel.control.missingRobot")
      : blocked
        ? (blockingIssue?.detail ?? blockingIssue?.label ?? t("sceneOps.readiness.blockedHint"))
        : readinessLoading
          ? t("sceneOps.control.readinessChecking")
          : (readinessError ?? t("sceneOps.control.readinessUnavailableShort"));

  const busy = phase.status === "running";
  const busyLabel = busy ? phase.label : null;

  useEffect(() => {
    void fetchRobotConfig()
      .then((next) => {
        setCfg(next);
        setWaypointId(next.waypoints[0]?.waypoint_id ?? "");
      })
      .catch((e) =>
        setPhase({
          status: "error",
          message: e instanceof Error ? e.message : String(e),
        }),
      );
  }, []);

  const actions = useMemo(
    () =>
      resolveRobotControlActions(
        opsSchema?.control.actions as SchemaControlAction[] | undefined,
        t,
        lang,
      ),
    [opsSchema?.control.actions, t, lang],
  );

  const grouped = useMemo(() => groupRobotControlActions(actions), [actions]);

  const executeIntent = async (action: ControlAction, attempt: "initial" | "confirmed") => {
    setConfirmState(null);
    setPhase({ status: "running", label: action.label, attempt });

    try {
      const result = await executeRobotIntent({
        intent: makeIntent(action.skill, action.parameters, robotId),
        confirmed: attempt === "confirmed",
      });
      setPhase({ status: "success", label: action.label, reply: result.reply });
    } catch (e) {
      if (attempt === "initial" && e instanceof AdminFetchError && e.status === 409) {
        const reason =
          typeof e.body.reason === "string" ? e.body.reason : t("sceneOps.robot.confirm.required");
        setPhase({ status: "idle" });
        setConfirmState({ kind: "server_409", action, reason });
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      setPhase({ status: "error", message, retryAction: action });
    }
  };

  const requestAction = (action: ControlAction) => {
    if (busy || controlsLocked) return;
    if (action.confirm) {
      setConfirmState({ kind: "pre_confirm", action });
      return;
    }
    void executeIntent(action, "initial");
  };

  const runCustom = (
    skill: string,
    parameters: Record<string, unknown>,
    confirm = false,
  ) => {
    requestAction({
      key: skill,
      label: skill.includes("speak")
        ? t("sceneOps.robot.action.speak")
        : skill.includes("volume")
          ? t("sceneOps.robot.action.setVolume")
          : skill.includes("navigate")
            ? t("sceneOps.robot.action.navigateToWaypoint")
            : skill,
      icon: renderIcon(iconForRobotSkill(skill)),
      skill,
      group: groupForRobotSkill(skill) as RobotControlGroupId,
      parameters,
      confirm,
    });
  };

  const onConfirmDialog = () => {
    if (!confirmState) return;
    const { kind, action } = confirmState;
    if (kind === "pre_confirm") {
      void executeIntent(action, "initial");
      return;
    }
    void executeIntent(action, "confirmed");
  };

  const confirmMessage =
    confirmState?.kind === "server_409"
      ? t("sceneOps.robot.confirm.continue", {
          reason: confirmState.reason ?? t("sceneOps.robot.confirm.required"),
        })
      : confirmState
        ? t("sceneOps.robot.confirm.execute", { label: confirmState.action.label })
        : "";

  const feedbackBusyLabel =
    phase.status === "running" ? t("sceneOps.robot.status.running", { label: phase.label }) : null;

  return {
    t,
    lang,
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
    robotId,
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
  };
}
