import { FormEvent, useEffect, useState } from "react";
import { Bot, CheckCircle2, Cloud, RadioTower, Settings2, ShieldCheck, Wifi } from "lucide-react";
import {
  AdminFetchError,
  fetchSettings,
  fetchStatus,
  saveSettings,
  PROVIDER_PRESETS,
  type AdminStatus,
  type LlmProvider,
  type PublicSettings,
  type SttProviderId,
} from "../../api";
import { track } from "@vercel/analytics";
import { useDomainPackState } from "../../contexts/DomainPackContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { OpsPageHeader } from "../../components/ops/OpsPageHeader";
import { getDeploymentDisplayName } from "../../i18n";
import { Banner } from "../../components/primitives/Banner";
import { StatusCard } from "../../components/primitives/StatusCard";
import { fieldAria, SettingsField } from "./SettingsField";
import { SettingsSection } from "./SettingsSection";
import { SettingsFormAiPanel } from "./SettingsFormAiPanel";
import { SettingsFormConnectivityPanel } from "./SettingsFormConnectivityPanel";
import { SettingsSubmitButton } from "./SettingsSubmitButton";
import type { SettingsFieldErrors } from "./settings-form-types";
import { useSettingsDirtyGuard } from "./useSettingsDirtyGuard";

type PlatformSettingsFormProps = {
  /** 嵌入平台底座 Tab 时隐藏页级 h1，避免与外层分区标题重复。 */
  hideHeader?: boolean;
};

/** 平台配置：deployment_id / active_domain / LLM / MQTT / STT */
export function PlatformSettingsForm({ hideHeader = false }: PlatformSettingsFormProps = {}) {
  const { t } = useLanguage();
  const { catalog: domainPackCatalog, reload: reloadDomainPacks } = useDomainPackState();

  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SettingsFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [integrationSecret, setIntegrationSecret] = useState("");
  const [sttApiKey, setSttApiKey] = useState("");
  const [sttAppKey, setSttAppKey] = useState("");
  const [sttAppId, setSttAppId] = useState("");
  const [provider, setProvider] = useState<LlmProvider>("deepseek");
  const [sttProvider, setSttProvider] = useState<SttProviderId>("none");
  const [baseUrl, setBaseUrl] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [sttModel, setSttModel] = useState("whisper-1");
  const [deploymentId, setDeploymentId] = useState("");
  const [activeDomain, setActiveDomain] = useState("");
  const [mqttUrl, setMqttUrl] = useState("");

  useSettingsDirtyGuard(dirty);

  function touch<T>(setter: (value: T) => void) {
    return (value: T) => {
      setDirty(true);
      setter(value);
    };
  }

  function applyProviderPreset(p: LlmProvider) {
    if (p === provider) return;
    const preset = PROVIDER_PRESETS[p];
    const cascadesBase = baseUrl !== preset.llm_base_url;
    const cascadesModel = llmModel !== preset.llm_model;
    const cascadesStt = p === "openai" && sttProvider === "none";
    if (cascadesBase || cascadesModel || cascadesStt) {
      const ok = window.confirm(t("settings.confirm.providerPreset"));
      if (!ok) return;
    }
    setDirty(true);
    setProvider(p);
    setBaseUrl(preset.llm_base_url);
    setLlmModel(preset.llm_model);
    setSttModel(preset.stt_model);
    if (cascadesStt) {
      setSttProvider("openai_whisper");
    }
  }

  async function reload() {
    setError(null);
    try {
      const [s, st] = await Promise.all([fetchSettings(), fetchStatus()]);
      setSettings(s);
      setStatus(st);
      setProvider(s.llm_provider);
      setSttProvider(s.stt_provider ?? "none");
      setBaseUrl(s.llm_base_url);
      setLlmModel(s.llm_model);
      setSttModel(s.stt_model);
      setDeploymentId(s.deployment_id);
      setActiveDomain(s.active_domain ?? "");
      setMqttUrl(s.mqtt_url ?? "");
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setMessage(null);
    setError(null);
    setFieldErrors({});
    setSaving(true);

    const patch: Record<string, unknown> = {
      deployment_id: deploymentId.trim(),
      active_domain: activeDomain.trim(),
      llm_provider: provider,
      llm_base_url: baseUrl,
      llm_model: llmModel,
      stt_provider: sttProvider,
      stt_model: sttModel,
      mqtt_url: mqttUrl.trim(),
    };
    if (apiKey.trim()) patch.llm_api_key = apiKey.trim();
    if (sttApiKey.trim()) patch.stt_api_key = sttApiKey.trim();
    if (sttAppKey.trim()) patch.stt_app_key = sttAppKey.trim();
    if (sttAppId.trim()) patch.stt_app_id = sttAppId.trim();
    if (integrationSecret.trim()) patch.integration_secret = integrationSecret.trim();

    try {
      const res = (await saveSettings(patch)) as { note?: string };
      setMessage(res.note ? t("settings.msg.llmSaved") : t("settings.msg.saved"));

      void track("config_saved", {
        llm_provider: provider,
        stt_provider: sttProvider,
        llm_key_updated: !!apiKey.trim(),
        stt_key_updated: !!(sttApiKey.trim() || sttAppKey.trim() || sttAppId.trim()),
        integration_secret_updated: !!integrationSecret.trim(),
        has_mqtt: !!mqttUrl.trim() || !!settings?.mqtt_url,
      });

      setApiKey("");
      setSttApiKey("");
      setSttAppKey("");
      setSttAppId("");
      setIntegrationSecret("");
      try {
        await Promise.all([reload(), reloadDomainPacks()]);
      } catch (err) {
        setError(
          t("settings.msg.partial", {
            err: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      // 粗粒度：把常见字段名映射到 fieldErrors，结构预留供后续 API 细粒度错误
      if (/mqtt/i.test(msg)) {
        setFieldErrors({ mqtt_url: msg });
      } else if (/deployment_id/i.test(msg)) {
        setFieldErrors({ deployment_id: msg });
      } else if (/active_domain/i.test(msg)) {
        setFieldErrors({ active_domain: msg });
      }
    } finally {
      setSaving(false);
    }
  }

  const showWhisperModel = sttProvider === "openai_whisper";
  const deploymentDisplayName = getDeploymentDisplayName(settings?.deployment_name, t);
  const livePacks = domainPackCatalog.filter((pack) => pack.status === "live");
  const activeDomainMissingFromRuntimeCatalog =
    Boolean(activeDomain) &&
    livePacks.length > 0 &&
    !livePacks.some((pack) => pack.id === activeDomain);

  return (
    <section className={hideHeader ? "settings-panel" : "settings settings-console"}>
      {!hideHeader && (
        <OpsPageHeader
          title={t("settings.scope.platform.title")}
          subtitle={t("settings.scope.platform.lead")}
          icon={<ShieldCheck size={22} aria-hidden />}
          actions={
            <strong className="ops-page-header__deployment" aria-label={t("settings.lockup.local")}>
              {deploymentDisplayName}
            </strong>
          }
        />
      )}
      {hideHeader && (
        <div className="ops-platform-config-meta">
          <p className="muted u-text-sm">{t("settings.scope.platform.lead")}</p>
          <strong className="ops-page-header__deployment" aria-label={t("settings.lockup.local")}>
            {deploymentDisplayName}
          </strong>
        </div>
      )}

      {error && <Banner variant="error">{error}</Banner>}
      {activeDomainMissingFromRuntimeCatalog && (
        <Banner variant="error">
          active_domain {activeDomain} 不在 API runtime live Domain Pack catalog 中。
        </Banner>
      )}
      {message && <Banner variant="ok">{message}</Banner>}

      <div className="console-workspace">
        {status && (
          <details className="ops-platform-details">
            <summary className="ops-platform-details-summary">{t("settings.more.status")}</summary>
            <div className="console-status-grid">
              <StatusCard
                icon={<CheckCircle2 size={20} aria-hidden />}
                label="API"
                value={status.api}
                ok={status.api === "ok"}
              />
              <StatusCard
                icon={<Bot size={20} aria-hidden />}
                label="LLM"
                value={status.llm_configured ? status.llm_model : t("settings.status.unconfigured")}
                ok={status.llm_configured}
              />
              <StatusCard
                icon={<Cloud size={20} aria-hidden />}
                label="STT"
                value={
                  status.stt_enabled
                    ? `${status.stt_provider} ${status.stt_model}`
                    : t("settings.status.transcribe")
                }
                ok
              />
              <StatusCard
                icon={<Wifi size={20} aria-hidden />}
                label="MQTT"
                value={status.mqtt_url}
                ok={Boolean(status.mqtt_url)}
              />
            </div>
          </details>
        )}

        <div className="settings-layout">
          <aside className="settings-nav" aria-label={t("settings.nav.label")}>
            <a href="#deployment-profile">
              <Settings2 size={17} aria-hidden />
              {t("settings.nav.basic")}
            </a>
            <a href="#connectivity">
              <RadioTower size={17} aria-hidden />
              {t("settings.nav.connect")}
            </a>
            <a href="#ai-config">
              <Bot size={17} aria-hidden />
              {t("settings.nav.ai")}
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
                    label={t("settings.field.deploymentId")}
                    name="deployment_id"
                    hint={t("settings.field.deploymentIdHint")}
                    error={fieldErrors.deployment_id}
                  >
                    <input
                      name="deployment_id"
                      autoComplete="off"
                      value={deploymentId}
                      onChange={(ev) => touch(setDeploymentId)(ev.target.value)}
                      placeholder="deployment_id"
                      {...fieldAria("deployment_id", fieldErrors.deployment_id)}
                    />
                  </SettingsField>
                  <SettingsField
                    label={t("settings.field.activeDomain")}
                    name="active_domain"
                    hint={t("settings.field.activeDomainHint")}
                    error={fieldErrors.active_domain}
                  >
                    <select
                      name="active_domain"
                      autoComplete="off"
                      value={activeDomain}
                      onChange={(ev) => touch(setActiveDomain)(ev.target.value)}
                      {...fieldAria("active_domain", fieldErrors.active_domain)}
                    >
                      <option value="">{t("settings.field.activeDomain.empty")}</option>
                      {livePacks.map((pack) => (
                        <option key={pack.id} value={pack.id}>
                          {pack.id} · {pack.display_name}
                        </option>
                      ))}
                    </select>
                  </SettingsField>
                </div>
              </SettingsSection>

              <SettingsFormConnectivityPanel
                t={t}
                settings={settings}
                mqttUrl={mqttUrl}
                integrationSecret={integrationSecret}
                fieldErrors={fieldErrors}
                onMqttUrlChange={touch(setMqttUrl)}
                onIntegrationSecretChange={touch(setIntegrationSecret)}
              />

              <SettingsFormAiPanel
                t={t}
                settings={settings}
                provider={provider}
                baseUrl={baseUrl}
                llmModel={llmModel}
                apiKey={apiKey}
                sttProvider={sttProvider}
                sttModel={sttModel}
                sttApiKey={sttApiKey}
                sttAppKey={sttAppKey}
                sttAppId={sttAppId}
                showWhisperModel={showWhisperModel}
                fieldErrors={fieldErrors}
                onProviderChange={applyProviderPreset}
                onBaseUrlChange={touch(setBaseUrl)}
                onLlmModelChange={touch(setLlmModel)}
                onApiKeyChange={touch(setApiKey)}
                onSttProviderChange={touch(setSttProvider)}
                onSttModelChange={touch(setSttModel)}
                onSttApiKeyChange={touch(setSttApiKey)}
                onSttAppKeyChange={touch(setSttAppKey)}
                onSttAppIdChange={touch(setSttAppId)}
              />

              <SettingsSubmitButton t={t} saving={saving} />
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
