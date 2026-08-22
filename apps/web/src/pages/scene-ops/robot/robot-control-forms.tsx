import { Megaphone, Navigation, Volume2 } from "lucide-react";
import type { RobotConfig } from "../../../api";

type TranslateFn = (key: string, params?: Record<string, string>) => string;

export type RobotTaskFormProps = {
  t: TranslateFn;
  waypointId: string;
  setWaypointId: (value: string) => void;
  busy: boolean;
  controlsLocked: boolean;
  lockReason: string;
  cfg: RobotConfig | null;
  runCustom: (skill: string, parameters: Record<string, unknown>, confirm?: boolean) => void;
};

export function RobotTaskForm({
  t,
  waypointId,
  setWaypointId,
  busy,
  controlsLocked,
  lockReason,
  cfg,
  runCustom,
}: RobotTaskFormProps) {
  return (
    <div className="form-grid robot-form-spaced">
      <label>
        {t("sceneOps.robot.field.waypointLabel")}
        <select
          value={waypointId}
          onChange={(e) => setWaypointId(e.target.value)}
          disabled={busy || controlsLocked}
        >
          <option value="">{t("sceneOps.robot.field.waypointPlaceholder")}</option>
          {(cfg?.waypoints ?? []).map((w) => (
            <option key={w.waypoint_id} value={w.waypoint_id}>
              {w.name ?? w.waypoint_id}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn btn--confirm-risk"
        disabled={busy || controlsLocked || !waypointId}
        title={controlsLocked ? lockReason : t("sceneOps.robot.confirm.hint")}
        onClick={() => runCustom("robot.navigate_to_waypoint", { waypoint_id: waypointId }, true)}
      >
        <Navigation size={16} /> {t("sceneOps.robot.action.navigateToWaypoint")}
      </button>
    </div>
  );
}

export type RobotLightAudioFormProps = {
  t: TranslateFn;
  speakText: string;
  setSpeakText: (value: string) => void;
  volume: number;
  setVolume: (value: number) => void;
  busy: boolean;
  controlsLocked: boolean;
  lockReason: string;
  runCustom: (skill: string, parameters: Record<string, unknown>, confirm?: boolean) => void;
};

export function RobotLightAudioForm({
  t,
  speakText,
  setSpeakText,
  volume,
  setVolume,
  busy,
  controlsLocked,
  lockReason,
  runCustom,
}: RobotLightAudioFormProps) {
  return (
    <div className="form-grid robot-form-spaced">
      <label>
        {t("sceneOps.robot.field.speakText")}
        <input
          value={speakText}
          onChange={(e) => setSpeakText(e.target.value)}
          disabled={busy || controlsLocked}
        />
      </label>
      <button
        type="button"
        className="btn"
        disabled={busy || controlsLocked}
        title={controlsLocked ? lockReason : undefined}
        onClick={() => runCustom("robot.speak", { text: speakText })}
      >
        <Megaphone size={16} /> {t("sceneOps.robot.action.speak")}
      </button>
      <label>
        {t("sceneOps.robot.field.volumeLabel", { volume: String(volume) })}
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          disabled={busy || controlsLocked}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </label>
      <button
        type="button"
        className="btn"
        disabled={busy || controlsLocked}
        title={controlsLocked ? lockReason : undefined}
        onClick={() => runCustom("robot.set_volume", { volume })}
      >
        <Volume2 size={16} /> {t("sceneOps.robot.action.setVolume")}
      </button>
    </div>
  );
}
