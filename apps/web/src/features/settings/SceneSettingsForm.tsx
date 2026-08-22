import { FormEvent, useEffect, useState } from "react";
import { BellRing, Cloud, Settings2, ShieldCheck } from "lucide-react";
import {
  AdminFetchError,
  fetchSettings,
  refreshGeoLocate,
  refreshNdviCache,
  saveSettings,
  type PublicSettings,
} from "../../api";
import { useDomainPackState } from "../../contexts/DomainPackContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { OpsPageHeader } from "../../components/ops/OpsPageHeader";
import { getDeploymentDisplayName } from "../../i18n";
import { Banner } from "../../components/primitives/Banner";
import { fieldAria, SettingsField } from "./SettingsField";
import { SettingsSection } from "./SettingsSection";
import { SettingsFormNotificationsPanel } from "./SettingsFormNotificationsPanel";
import { SettingsSubmitButton } from "./SettingsSubmitButton";
import type { SettingsFieldErrors } from "./settings-form-types";
import { useSettingsDirtyGuard } from "./useSettingsDirtyGuard";

/** 场景配置：deployment_name / geo / satellite / notifications */
export function SceneSettingsForm() {
  const { t } = useLanguage();
  const { catalog: domainPackCatalog } = useDomainPackState();

  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SettingsFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [deploymentName, setDeploymentName] = useState("");
  const [geoLat, setGeoLat] = useState("");
  const [geoLng, setGeoLng] = useState("");
  const [satellitePlotsJson, setSatellitePlotsJson] = useState("[]");
  const [satelliteApiKey, setSatelliteApiKey] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  const [ndviBusy, setNdviBusy] = useState(false);
  const [nlgEnabled, setNlgEnabled] = useState(true);
  const [alertPushEnabled, setAlertPushEnabled] = useState(true);
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [weatherProactiveEnabled, setWeatherProactiveEnabled] = useState(true);

  useSettingsDirtyGuard(dirty);

  function touch<T>(setter: (value: T) => void) {
    return (value: T) => {
      setDirty(true);
      setter(value);
    };
  }

  async function reload() {
    setError(null);
    try {
      const s = await fetchSettings();
      setSettings(s);
      setDeploymentName(s.deployment_name ?? "");
      setGeoLat(s.geo_latitude != null ? String(s.geo_latitude) : "");
      setGeoLng(s.geo_longitude != null ? String(s.geo_longitude) : "");
      setSatellitePlotsJson(JSON.stringify(s.satellite_plots ?? [], null, 2));
      setNlgEnabled(s.nlg_enabled !== false);
      setAlertPushEnabled(s.alert_push_enabled !== false);
      setDigestEnabled(s.digest_enabled !== false);
      setWeatherProactiveEnabled(s.weather_proactive_enabled !== false);
      setDirty(false);
      setFieldErrors({});
    } catch (e) {
      if (e instanceof AdminFetchError && e.status === 401) {
        setError(t("api.error.unauthorizedAdmin"));
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const selectedDomain = settings?.active_domain ?? "";
  const selectedPack = domainPackCatalog.find((pack) => pack.id === selectedDomain);
  const selectedCapabilities = selectedPack?.capabilities ?? {};
  const showDigestConfig = selectedCapabilities.digest === true;
  const showWeatherProactiveConfig = selectedCapabilities.weatherProactive === true;
  const showSatelliteConfig = selectedCapabilities.satellite === true;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setMessage(null);
    setError(null);
    setFieldErrors({});

    const nextFieldErrors: SettingsFieldErrors = {};
    const latTrim = geoLat.trim();
    const lngTrim = geoLng.trim();
    if (latTrim || lngTrim) {
      const lat = Number(latTrim);
      const lng = Number(lngTrim);
      if (!Number.isFinite(lat)) {
        nextFieldErrors.geo_latitude = t("settings.fieldError.latitude");
      }
      if (!Number.isFinite(lng)) {
        nextFieldErrors.geo_longitude = t("settings.fieldError.longitude");
      }
    }

    let satellitePlots: unknown[] | undefined;
    if (showSatelliteConfig) {
      try {
        const plots = JSON.parse(satellitePlotsJson) as unknown;
        if (!Array.isArray(plots)) {
          nextFieldErrors.satellite_plots = t("settings.msg.satelliteJsonInvalid");
        } else {
          satellitePlots = plots;
        }
      } catch {
        nextFieldErrors.satellite_plots = t("settings.msg.satelliteJsonInvalid");
      }
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      const firstKey = Object.keys(nextFieldErrors)[0];
      const el = document.querySelector<HTMLElement>(
        `[name="${firstKey}"], #settings-field-error-${firstKey}`,
      );
      el?.focus?.();
      return;
    }

    setSaving(true);
    const patch: Record<string, unknown> = {
      deployment_name: deploymentName.trim() || settings?.deployment_name,
      nlg_enabled: nlgEnabled,
      alert_push_enabled: alertPushEnabled,
    };
    if (showDigestConfig) patch.digest_enabled = digestEnabled;
    if (showWeatherProactiveConfig) {
      patch.weather_proactive_enabled = weatherProactiveEnabled;
    }
    if (latTrim && lngTrim) {
      const lat = Number(latTrim);
      const lng = Number(lngTrim);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        patch.geo_latitude = lat;
        patch.geo_longitude = lng;
      }
    }
    if (showSatelliteConfig) {
      if (satellitePlots) patch.satellite_plots = satellitePlots;
      if (satelliteApiKey.trim()) patch.satellite_api_key = satelliteApiKey.trim();
    }

    try {
      const res = (await saveSettings(patch)) as { note?: string };
      setMessage(res.note ? t("settings.msg.llmSaved") : t("settings.msg.saved"));
      setSatelliteApiKey("");
      try {
        await reload();
      } catch (err) {
        setError(
          t("settings.msg.partial", {
            err: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function doNetworkLocate(unlock = false) {
    setGeoBusy(true);
    setError(null);
    try {
      const res = (await refreshGeoLocate({ force: true, unlock })) as {
        note?: string;
      };
      if (res.note) setMessage(res.note);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeoBusy(false);
    }
  }

  const deploymentDisplayName = getDeploymentDisplayName(settings?.deployment_name, t);
  const geoSourceKey = settings?.geo_coordinates_source
    ? `settings.geo.source.${settings.geo_coordinates_source}`
    : null;
  const geoSourceLabel = geoSourceKey ? t(geoSourceKey) : "—";

  return (
    <section className="settings settings-console">
      <OpsPageHeader
        title={t("settings.scope.scene.title")}
        subtitle={t("settings.scope.scene.lead")}
        icon={<ShieldCheck size={22} aria-hidden />}
        actions={
          <strong className="ops-page-header__deployment" aria-label={t("settings.lockup.local")}>
            {deploymentDisplayName}
          </strong>
        }
      />

      {error && <Banner variant="error">{error}</Banner>}
      {message && <Banner variant="ok">{message}</Banner>}

      <div className="console-workspace">
        <div className="settings-layout">
          <aside className="settings-nav" aria-label={t("settings.nav.label")}>
            <a href="#deployment-profile">
              <Settings2 size={17} aria-hidden />
              {t("settings.nav.basic")}
            </a>
            <a href="#notifications-config">
              <BellRing size={17} aria-hidden />
              {t("settings.nav.notifications")}
            </a>
          </aside>

          <div className="settings-main">
            <form className="settings-form console-form" onSubmit={onSubmit} noValidate>
              <SettingsSection
                id="deployment-profile"
                icon={<Settings2 size={20} aria-hidden />}
                title={t("settings.section.basic.title")}
                text={t("settings.section.basic.desc")}
              >
                <div className="form-grid">
                  <SettingsField
                    label={t("settings.field.farm")}
                    name="deployment_name"
                    error={fieldErrors.deployment_name}
                  >
                    <input
                      name="deployment_name"
                      autoComplete="organization"
                      value={deploymentName}
                      onChange={(ev) => touch(setDeploymentName)(ev.target.value)}
                      {...fieldAria("deployment_name", fieldErrors.deployment_name)}
                    />
                  </SettingsField>
                </div>

                <div className="form-grid u-mt-field">
                  <div className="u-grid-span-full">
                    <h3 className="settings-subsection-title">{t("settings.section.geo.title")}</h3>
                    <p className="muted settings-subsection-desc">
                      {t("settings.section.geo.desc")}
                    </p>
                    <p className="settings-geo-status">
                      <strong>{geoSourceLabel}</strong>
                      {settings?.geo_coordinates_updated_at && (
                        <span className="muted">
                          {" "}
                          —{" "}
                          {t("settings.geo.updated", {
                            time: new Date(settings.geo_coordinates_updated_at).toLocaleString(),
                          })}
                        </span>
                      )}
                      {settings?.geo_coordinates_node_id && (
                        <span className="muted">
                          {" "}
                          ({t("settings.geo.node", { node: settings.geo_coordinates_node_id })})
                        </span>
                      )}
                      {settings?.geo_coordinates_accuracy_m != null && (
                        <span className="muted">
                          {" "}
                          (
                          {t("settings.geo.accuracy", {
                            meters: String(Math.round(settings.geo_coordinates_accuracy_m)),
                          })}
                          )
                        </span>
                      )}
                      {settings?.geo_coordinates_city && (
                        <span className="muted">
                          {" "}
                          ({t("settings.geo.city", { city: settings.geo_coordinates_city })})
                        </span>
                      )}
                    </p>
                  </div>
                  <SettingsField
                    label={t("settings.field.latitude")}
                    name="geo_latitude"
                    error={fieldErrors.geo_latitude}
                  >
                    <input
                      name="geo_latitude"
                      autoComplete="off"
                      inputMode="decimal"
                      value={geoLat}
                      onChange={(ev) => touch(setGeoLat)(ev.target.value)}
                      placeholder="31.23"
                      {...fieldAria("geo_latitude", fieldErrors.geo_latitude)}
                    />
                  </SettingsField>
                  <SettingsField
                    label={t("settings.field.longitude")}
                    name="geo_longitude"
                    error={fieldErrors.geo_longitude}
                  >
                    <input
                      name="geo_longitude"
                      autoComplete="off"
                      inputMode="decimal"
                      value={geoLng}
                      onChange={(ev) => touch(setGeoLng)(ev.target.value)}
                      placeholder="121.47"
                      {...fieldAria("geo_longitude", fieldErrors.geo_longitude)}
                    />
                  </SettingsField>
                  <div className="u-flex u-gap-sm u-flex-wrap u-items-center">
                    <button
                      type="button"
                      className="btn"
                      disabled={geoBusy}
                      onClick={() => void doNetworkLocate(false)}
                    >
                      {geoBusy ? t("settings.geo.busy") : t("settings.geo.btn.network")}
                    </button>
                    {settings?.geo_coordinates_source === "manual" && (
                      <button
                        type="button"
                        className="btn"
                        disabled={geoBusy}
                        onClick={() => void doNetworkLocate(true)}
                      >
                        {t("settings.geo.btn.network.unlock")}
                      </button>
                    )}
                  </div>
                </div>
              </SettingsSection>

              {showSatelliteConfig && (
                <SettingsSection
                  id="satellite-config"
                  icon={<Cloud size={20} aria-hidden />}
                  title={t("settings.section.satellite.title")}
                  text={t("settings.section.satellite.desc")}
                >
                  <div className="form-grid">
                    <SettingsField
                      label={t("settings.field.satelliteApiKey")}
                      name="satellite_api_key"
                      error={fieldErrors.satellite_api_key}
                    >
                      <input
                        name="satellite_api_key"
                        type="password"
                        autoComplete="off"
                        value={satelliteApiKey}
                        onChange={(ev) => touch(setSatelliteApiKey)(ev.target.value)}
                        placeholder={
                          settings?.satellite_api_key_set
                            ? t("settings.placeholder.llmkey.set", {
                                masked: "****",
                              })
                            : "Bearer token"
                        }
                        {...fieldAria("satellite_api_key", fieldErrors.satellite_api_key)}
                      />
                    </SettingsField>
                    <div className="u-self-end">
                      <button
                        type="button"
                        className="btn"
                        disabled={ndviBusy}
                        onClick={() => {
                          setNdviBusy(true);
                          void refreshNdviCache()
                            .then((res: { refreshed?: number }) => {
                              setMessage(
                                t("settings.msg.ndviRefreshed", {
                                  count: String(res.refreshed ?? 0),
                                }),
                              );
                              return reload();
                            })
                            .catch((err) =>
                              setError(err instanceof Error ? err.message : String(err)),
                            )
                            .finally(() => setNdviBusy(false));
                        }}
                      >
                        {ndviBusy ? t("settings.satellite.busy") : t("settings.satellite.refresh")}
                      </button>
                    </div>
                    <details className="ops-platform-details u-grid-span-full">
                      <summary className="ops-platform-details-summary">
                        {t("settings.satellite.plotsAdvanced")}
                      </summary>
                      <SettingsField
                        label={t("settings.field.satellitePlots")}
                        name="satellite_plots"
                        className="u-grid-span-full"
                        error={fieldErrors.satellite_plots}
                      >
                        <textarea
                          name="satellite_plots"
                          rows={6}
                          value={satellitePlotsJson}
                          onChange={(ev) => touch(setSatellitePlotsJson)(ev.target.value)}
                          spellCheck={false}
                          autoComplete="off"
                          {...fieldAria("satellite_plots", fieldErrors.satellite_plots)}
                        />
                      </SettingsField>
                    </details>
                  </div>
                </SettingsSection>
              )}

              <SettingsFormNotificationsPanel
                t={t}
                nlgEnabled={nlgEnabled}
                alertPushEnabled={alertPushEnabled}
                digestEnabled={digestEnabled}
                weatherProactiveEnabled={weatherProactiveEnabled}
                showDigestConfig={showDigestConfig}
                showWeatherProactiveConfig={showWeatherProactiveConfig}
                onNlgEnabledChange={touch(setNlgEnabled)}
                onAlertPushEnabledChange={touch(setAlertPushEnabled)}
                onDigestEnabledChange={touch(setDigestEnabled)}
                onWeatherProactiveEnabledChange={touch(setWeatherProactiveEnabled)}
              />

              <SettingsSubmitButton t={t} saving={saving} />
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
