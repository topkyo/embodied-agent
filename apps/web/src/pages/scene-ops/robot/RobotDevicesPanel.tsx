import { useCallback, useEffect, useState } from "react";
import { RadioTower } from "lucide-react";
import {
  fetchRobotConfig,
  saveRobotRegistry,
  type RobotConfig,
  type RobotDevice,
} from "../../../api";
import { Banner } from "../../../components/primitives/Banner";
import { PanelTitle } from "../../../components/primitives/PanelTitle";
import { useAuth } from "../../../contexts/AuthContext";
import { useLanguage } from "../../../contexts/LanguageContext";

/**
 * 机器人注册表：只读列表对 operator 可见；保存 registry 仅 admin。
 * （与 RobotSettingsPanel 同构守卫，避免 user 会话可点写操作。）
 */
export function RobotDevicesPanel() {
  const { t } = useLanguage();
  const { isAdmin } = useAuth();
  const [cfg, setCfg] = useState<RobotConfig | null>(null);
  const [robotsJson, setRobotsJson] = useState("[]");
  const [defaultRobotId, setDefaultRobotId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const next = await fetchRobotConfig();
    setCfg(next);
    setRobotsJson(JSON.stringify(next.robots, null, 2));
    setDefaultRobotId(next.default_robot_id ?? "");
  }, []);

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [reload]);

  const onSave = async () => {
    if (!isAdmin) {
      setError(t("sceneOps.adminOnly.title"));
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const robots = JSON.parse(robotsJson) as unknown;
      if (!Array.isArray(robots)) throw new Error(t("sceneOps.robot.error.robotsArray"));
      if (robots.length === 0) throw new Error(t("sceneOps.robot.error.robotsRequired"));
      if (!defaultRobotId.trim()) throw new Error(t("sceneOps.robot.error.defaultRobotRequired"));
      if (!robots.some((robot: RobotDevice) => robot.device_id === defaultRobotId.trim())) {
        throw new Error(t("sceneOps.robot.error.defaultRobotInvalid"));
      }
      await saveRobotRegistry({ robots, default_robot_id: defaultRobotId.trim() });
      setMessage(t("sceneOps.robot.success.registrySaved"));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="settings-panel">
      <PanelTitle
        icon={<RadioTower size={20} aria-hidden />}
        title={t("sceneOps.robot.panel.registry.title")}
        text={t("sceneOps.robot.panel.registry.text")}
      />
      {error && <Banner variant="error">{error}</Banner>}
      {message && <Banner variant="ok">{message}</Banner>}
      {!isAdmin && <Banner variant="error">{t("sceneOps.adminOnly.title")}</Banner>}
      {cfg && cfg.robots.length === 0 && (
        <Banner variant="error">{t("sceneOps.robot.panel.registry.empty")}</Banner>
      )}
      <div className="form-grid">
        <label>
          {t("sceneOps.robot.field.defaultRobotId")}
          <select
            value={defaultRobotId}
            onChange={(e) => setDefaultRobotId(e.target.value)}
            disabled={!isAdmin}
          >
            <option value="">{t("sceneOps.robot.field.defaultRobotPlaceholder")}</option>
            {(cfg?.robots ?? []).map((r) => (
              <option key={r.device_id} value={r.device_id}>
                {r.name} ({r.device_id})
              </option>
            ))}
          </select>
        </label>
        <label className="u-grid-span-full">
          {t("sceneOps.robot.field.robots")}
          <textarea
            rows={12}
            value={robotsJson}
            onChange={(e) => setRobotsJson(e.target.value)}
            spellCheck={false}
            disabled={!isAdmin}
            readOnly={!isAdmin}
          />
        </label>
      </div>
      {isAdmin ? (
        <button
          type="button"
          className="btn primary"
          disabled={saving}
          onClick={() => void onSave()}
        >
          {saving ? t("sceneOps.robot.action.saving") : t("sceneOps.robot.action.saveRegistry")}
        </button>
      ) : null}
    </section>
  );
}
