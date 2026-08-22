import { Bot } from "lucide-react";
import type { LlmProvider, PublicSettings, SttProviderId } from "../../api";
import { fieldAria, SettingsField } from "./SettingsField";
import { SettingsSection } from "./SettingsSection";
import type { SettingsFieldErrors, TranslateFn } from "./settings-form-types";

export type SettingsFormAiPanelProps = {
  t: TranslateFn;
  settings: PublicSettings | null;
  provider: LlmProvider;
  baseUrl: string;
  llmModel: string;
  apiKey: string;
  sttProvider: SttProviderId;
  sttModel: string;
  sttApiKey: string;
  sttAppKey: string;
  sttAppId: string;
  showWhisperModel: boolean;
  fieldErrors?: SettingsFieldErrors;
  onProviderChange: (provider: LlmProvider) => void;
  onBaseUrlChange: (value: string) => void;
  onLlmModelChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onSttProviderChange: (value: SttProviderId) => void;
  onSttModelChange: (value: string) => void;
  onSttApiKeyChange: (value: string) => void;
  onSttAppKeyChange: (value: string) => void;
  onSttAppIdChange: (value: string) => void;
};

export function SettingsFormAiPanel({
  t,
  settings,
  provider,
  baseUrl,
  llmModel,
  apiKey,
  sttProvider,
  sttModel,
  sttApiKey,
  sttAppKey,
  sttAppId,
  showWhisperModel,
  fieldErrors = {},
  onProviderChange,
  onBaseUrlChange,
  onLlmModelChange,
  onApiKeyChange,
  onSttProviderChange,
  onSttModelChange,
  onSttApiKeyChange,
  onSttAppKeyChange,
  onSttAppIdChange,
}: SettingsFormAiPanelProps) {
  return (
    <SettingsSection
      id="ai-config"
      icon={<Bot size={20} aria-hidden />}
      title={t("settings.section.ai.title")}
      text={t("settings.section.ai.desc")}
    >
      <div className="form-grid">
        <SettingsField
          label={t("settings.field.provider")}
          name="llm_provider"
          error={fieldErrors.llm_provider}
        >
          <select
            name="llm_provider"
            autoComplete="off"
            value={provider}
            onChange={(ev) => onProviderChange(ev.target.value as LlmProvider)}
            {...fieldAria("llm_provider", fieldErrors.llm_provider)}
          >
            <option value="deepseek">{t("settings.option.deepseek")}</option>
            <option value="openai">{t("settings.option.openai")}</option>
          </select>
        </SettingsField>
        <SettingsField
          label={t("settings.field.base")}
          name="llm_base_url"
          error={fieldErrors.llm_base_url}
        >
          <input
            name="llm_base_url"
            type="url"
            autoComplete="url"
            value={baseUrl}
            onChange={(ev) => onBaseUrlChange(ev.target.value)}
            {...fieldAria("llm_base_url", fieldErrors.llm_base_url)}
          />
        </SettingsField>
        <SettingsField
          label={t("settings.field.model")}
          name="llm_model"
          error={fieldErrors.llm_model}
        >
          <input
            name="llm_model"
            autoComplete="off"
            value={llmModel}
            onChange={(ev) => onLlmModelChange(ev.target.value)}
            placeholder={provider === "openai" ? "gpt-4o" : "deepseek-v4-flash"}
            {...fieldAria("llm_model", fieldErrors.llm_model)}
          />
        </SettingsField>
        <SettingsField
          label={t("settings.field.llmkey")}
          name="llm_api_key"
          error={fieldErrors.llm_api_key}
        >
          <input
            name="llm_api_key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(ev) => onApiKeyChange(ev.target.value)}
            placeholder={
              settings?.llm_api_key_set
                ? t("settings.placeholder.llmkey.set", {
                    masked: settings.llm_api_key_masked ?? "",
                  })
                : "sk-..."
            }
            {...fieldAria("llm_api_key", fieldErrors.llm_api_key)}
          />
        </SettingsField>
      </div>

      <details className="ops-platform-details u-mt-field">
        <summary className="ops-platform-details-summary">{t("settings.more.stt")}</summary>
        <p className="muted ops-platform-details-lead">{t("settings.hint.stt")}</p>
        <div className="form-grid">
          <SettingsField
            label={t("settings.field.stt")}
            name="stt_provider"
            error={fieldErrors.stt_provider}
          >
            <select
              name="stt_provider"
              autoComplete="off"
              value={sttProvider}
              onChange={(ev) => onSttProviderChange(ev.target.value as SttProviderId)}
              {...fieldAria("stt_provider", fieldErrors.stt_provider)}
            >
              <option value="none">{t("settings.option.stt.none")}</option>
              <option value="openai_whisper">{t("settings.option.stt.openai")}</option>
              <option value="aliyun">{t("settings.option.stt.ali")}</option>
              <option value="iflytek">{t("settings.option.stt.ifly")}</option>
            </select>
          </SettingsField>
          {showWhisperModel && (
            <SettingsField
              label={t("settings.field.whisper")}
              name="stt_model"
              error={fieldErrors.stt_model}
            >
              <input
                name="stt_model"
                autoComplete="off"
                value={sttModel}
                onChange={(ev) => onSttModelChange(ev.target.value)}
                {...fieldAria("stt_model", fieldErrors.stt_model)}
              />
            </SettingsField>
          )}
          {sttProvider === "aliyun" && (
            <>
              <SettingsField
                label={t("settings.field.ali.appkey")}
                name="stt_app_key"
                error={fieldErrors.stt_app_key}
              >
                <input
                  name="stt_app_key"
                  autoComplete="off"
                  value={sttAppKey}
                  onChange={(ev) => onSttAppKeyChange(ev.target.value)}
                  placeholder={settings?.stt_app_key_set ? t("settings.placeholder.set") : ""}
                  {...fieldAria("stt_app_key", fieldErrors.stt_app_key)}
                />
              </SettingsField>
              <SettingsField
                label={t("settings.field.ali.token")}
                name="stt_api_key"
                error={fieldErrors.stt_api_key}
              >
                <input
                  name="stt_api_key"
                  type="password"
                  autoComplete="off"
                  value={sttApiKey}
                  onChange={(ev) => onSttApiKeyChange(ev.target.value)}
                  placeholder={
                    settings?.stt_api_key_set
                      ? t("settings.placeholder.llmkey.set", {
                          masked: settings.stt_api_key_masked ?? "",
                        })
                      : t("settings.placeholder.ali.token")
                  }
                  {...fieldAria("stt_api_key", fieldErrors.stt_api_key)}
                />
              </SettingsField>
            </>
          )}
          {sttProvider === "iflytek" && (
            <>
              <SettingsField
                label={t("settings.field.ifly.appid")}
                name="stt_app_id"
                error={fieldErrors.stt_app_id}
              >
                <input
                  name="stt_app_id"
                  autoComplete="off"
                  value={sttAppId}
                  onChange={(ev) => onSttAppIdChange(ev.target.value)}
                  placeholder={settings?.stt_app_id_set ? t("settings.placeholder.set") : ""}
                  {...fieldAria("stt_app_id", fieldErrors.stt_app_id)}
                />
              </SettingsField>
              <SettingsField
                label={t("settings.field.ifly.key")}
                name="stt_app_key"
                error={fieldErrors.stt_app_key}
              >
                <input
                  name="stt_app_key"
                  autoComplete="off"
                  value={sttAppKey}
                  onChange={(ev) => onSttAppKeyChange(ev.target.value)}
                  placeholder={settings?.stt_app_key_set ? t("settings.placeholder.set") : ""}
                  {...fieldAria("stt_app_key", fieldErrors.stt_app_key)}
                />
              </SettingsField>
              <SettingsField
                label={t("settings.field.ifly.secret")}
                name="stt_api_key"
                error={fieldErrors.stt_api_key}
              >
                <input
                  name="stt_api_key"
                  type="password"
                  autoComplete="off"
                  value={sttApiKey}
                  onChange={(ev) => onSttApiKeyChange(ev.target.value)}
                  placeholder={
                    settings?.stt_api_key_set
                      ? t("settings.placeholder.llmkey.set", {
                          masked: settings.stt_api_key_masked ?? "",
                        })
                      : ""
                  }
                  {...fieldAria("stt_api_key", fieldErrors.stt_api_key)}
                />
              </SettingsField>
            </>
          )}
          {sttProvider === "openai_whisper" && (
            <SettingsField
              label={t("settings.field.openai.stt")}
              name="stt_api_key"
              error={fieldErrors.stt_api_key}
            >
              <input
                name="stt_api_key"
                type="password"
                autoComplete="off"
                value={sttApiKey}
                onChange={(ev) => onSttApiKeyChange(ev.target.value)}
                placeholder={
                  settings?.stt_api_key_set
                    ? t("settings.placeholder.llmkey.set", {
                        masked: settings.stt_api_key_masked ?? "",
                      })
                    : t("settings.placeholder.openai.stt")
                }
                {...fieldAria("stt_api_key", fieldErrors.stt_api_key)}
              />
            </SettingsField>
          )}
        </div>
      </details>
    </SettingsSection>
  );
}
