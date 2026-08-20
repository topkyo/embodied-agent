import { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { fetchRobotConfig, saveSettings, type RobotConfig } from "../../../api";
import { Banner } from "../../../components/primitives/Banner";
import { PanelTitle } from "../../../components/primitives/PanelTitle";
import { useAuth } from "../../../contexts/AuthContext";
import { useDomainPackState } from "../../../contexts/DomainPackContext";
import { useLanguage } from "../../../contexts/LanguageContext";
import { ROBOTICS_PACK_ID } from "./shared";

/**
 * Robotics domain 配置：经统一 saveSettings 写入 domain_configs.robotics。
 * 不隐式切换 active_domain；未启用 robotics 时仅提示并禁用保存。
 */
export function RobotSettingsPanel() {
  const { t } = useLanguage();
  const { isAdmin } = useAuth();
  const { activeDomain, reload: reloadDomainPacks } = useDomainPackState();
  const [cfg, setCfg] = useState<RobotConfig | null>(null);
  const [m20Url, setM20Url] = useState("");
  const [defaultRobotId, setDefaultRobotId] = useState("");
  const [waypointsJson, setWaypointsJson] = useState("[]");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const roboticsActive =
    activeDomain === ROBOTICS_PACK_ID || cfg?.active_domain === ROBOTICS_PACK_ID;

  const reload = useCallback(async () => {
    const next = await fetchRobotConfig();
    setCfg(next);
    setM20Url(next.m20_base_url ?? "");
    setDefaultRobotId(next.default_robot_id ?? "");
    setWaypointsJson(JSON.stringify(next.waypoints ?? [], null, 2));
  }, []);

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [reload]);

  const onSave = async () => {
    if (!isAdmin) {
      setError(t("sceneOps.adminOnly.title"));
      return;
    }
    if (!roboticsActive) {
      setError(t("sceneOps.robot.banner.unenabled"));
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const waypoints = JSON.parse(waypointsJson) as unknown;
      if (!Array.isArray(waypoints)) throw new Error(t("sceneOps.robot.error.waypointsArray"));
      // 统一走 /admin/settings；不写入 active_domain，避免隐式切换。
      await saveSettings({
        domain_configs: {
          [ROBOTICS_PACK_ID]: {
            m20_base_url: m20Url.trim(),
            default_robot_id: defaultRobotId.trim(),
            waypoints,
          },
        },
      });
      setMessage(t("sceneOps.robot.success.configSaved"));
      await Promise.all([reload(), reloadDomainPacks()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="settings-panel">
      <PanelTitle
        icon={<Save size={20} aria-hidden />}
        title={t("sceneOps.robot.panel.config.title")}
        text={t("sceneOps.robot.panel.config.text")}
      />
      {error && <Banner variant="error">{error}</Banner>}
      {message && <Banner variant="ok">{message}</Banner>}
      {!roboticsActive && <Banner variant="error">{t("sceneOps.robot.banner.unenabled")}</Banner>}
      {roboticsActive && (
        <p className="muted u-text-sm">{t("sceneOps.robot.banner.saveViaSettings")}</p>
      )}
      <div className="form-grid">
        <label>
          {t("sceneOps.robot.field.m20BaseUrl")}
          <input
            value={m20Url}
            onChange={(e) => setM20Url(e.target.value)}
            placeholder="http://127.0.0.1:3099"
          />
        </label>
        <label>
          {t("sceneOps.robot.field.defaultRobotId")}
          <select value={defaultRobotId} onChange={(e) => setDefaultRobotId(e.target.value)}>
            <option value="">{t("sceneOps.robot.field.defaultRobotPlaceholder")}</option>
            {(cfg?.robots ?? []).map((r) => (
              <option key={r.device_id} value={r.device_id}>
                {r.name} ({r.device_id})
              </option>
            ))}
          </select>
        </label>
        <label className="u-grid-span-full">
          {t("sceneOps.robot.field.waypoints")}
          <textarea
            rows={10}
            value={waypointsJson}
            onChange={(e) => setWaypointsJson(e.target.value)}
            spellCheck={false}
          />
        </label>
      </div>
      <div className="settings-actions">
        <button
          type="button"
          className="btn primary"
          disabled={saving || !roboticsActive || !isAdmin}
          onClick={() => void onSave()}
        >
          <Save size={17} aria-hidden />
          {saving ? t("sceneOps.robot.action.saving") : t("sceneOps.robot.action.saveConfig")}
        </button>
      </div>
    </section>
  );
}
