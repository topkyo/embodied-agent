import { useCallback, useEffect, useState } from "react";
import { Bot, Gamepad2, Navigation, RadioTower } from "lucide-react";
import { fetchRobotOverview, type RobotOverview } from "../../../api";
import { Banner } from "../../../components/primitives/Banner";
import { PanelTitle } from "../../../components/primitives/PanelTitle";
import { StatusCard } from "../../../components/primitives/StatusCard";
import { useLanguage } from "../../../contexts/LanguageContext";
import { useInterval } from "../../../hooks/useInterval";
import { jsonPreview, ROBOTICS_PACK_ID } from "./shared";

const ROBOT_OVERVIEW_POLL_MS = 30_000;

export function RobotOverviewPanel() {
  const { t } = useLanguage();
  const [overview, setOverview] = useState<RobotOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setOverview(await fetchRobotOverview());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useInterval(() => void reload(), ROBOT_OVERVIEW_POLL_MS, { visibleOnly: true });

  return (
    <>
      {error && <Banner variant="error">{error}</Banner>}
      {overview && overview.active_domain !== ROBOTICS_PACK_ID && (
        <Banner variant="error">
          {t("sceneOps.robot.banner.overviewInactive", { active: overview.active_domain })}
        </Banner>
      )}
      {overview && (
        <div className="console-workspace">
          <div className="console-status-grid">
            <StatusCard
              icon={<Bot size={20} aria-hidden />}
              label={t("sceneOps.robot.status.domainPack")}
              value={overview.active_domain}
              ok={overview.active_domain === ROBOTICS_PACK_ID}
            />
            <StatusCard
              icon={<RadioTower size={20} aria-hidden />}
              label={t("sceneOps.robot.status.m20Api")}
              value={
                overview.m20.ok
                  ? t("sceneOps.robot.status.connected")
                  : t("sceneOps.robot.status.partial")
              }
              ok={overview.m20.ok}
            />
            <StatusCard
              icon={<Gamepad2 size={20} aria-hidden />}
              label={t("sceneOps.robot.status.defaultRobot")}
              value={overview.default_robot_id || t("sceneOps.robot.status.unconfigured")}
              ok={overview.configured}
            />
            <StatusCard
              icon={<Navigation size={20} aria-hidden />}
              label={t("sceneOps.robot.status.pending")}
              value={String(overview.pending_confirms_count)}
              ok={overview.pending_confirms_count === 0}
            />
          </div>

          {overview.m20.error && <Banner variant="error">{overview.m20.error}</Banner>}

          <section className="settings-panel">
            <PanelTitle
              icon={<Bot size={20} aria-hidden />}
              title={t("sceneOps.robot.panel.overview.title")}
              text={t("sceneOps.robot.panel.overview.text")}
            />
            <div className="form-grid">
              {[
                [t("sceneOps.robot.field.status"), overview.m20.status],
                [t("sceneOps.robot.field.sensors"), overview.m20.sensors],
                [t("sceneOps.robot.field.obstacle"), overview.m20.obstacle],
                [t("sceneOps.robot.field.pose"), overview.m20.pose],
                [t("sceneOps.robot.field.navigation"), overview.m20.navigation],
              ].map(([name, value]) => (
                <label key={String(name)} className="u-grid-col-span-1">
                  {String(name)}
                  <textarea value={jsonPreview(value)} readOnly rows={6} />
                </label>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
