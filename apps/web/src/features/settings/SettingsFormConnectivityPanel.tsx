import { Wifi } from "lucide-react";
import type { PublicSettings } from "../../api";
import { fieldAria, SettingsField } from "./SettingsField";
import { SettingsSection } from "./SettingsSection";
import type { SettingsFieldErrors, TranslateFn } from "./settings-form-types";

export type SettingsFormConnectivityPanelProps = {
  t: TranslateFn;
  settings: PublicSettings | null;
  mqttUrl: string;
  integrationSecret: string;
  fieldErrors?: SettingsFieldErrors;
  onMqttUrlChange: (value: string) => void;
  onIntegrationSecretChange: (value: string) => void;
};

export function SettingsFormConnectivityPanel({
  t,
  settings,
  mqttUrl,
  integrationSecret,
  fieldErrors = {},
  onMqttUrlChange,
  onIntegrationSecretChange,
}: SettingsFormConnectivityPanelProps) {
  return (
    <SettingsSection
      id="connectivity"
      icon={<Wifi size={20} aria-hidden />}
      title={t("settings.section.connect.title")}
      text={t("settings.section.connect.desc")}
    >
      <div className="form-grid">
        <SettingsField
          label={t("settings.field.mqtt")}
          name="mqtt_url"
          error={fieldErrors.mqtt_url}
        >
          <input
            name="mqtt_url"
            type="text"
            inputMode="url"
            autoComplete="off"
            value={mqttUrl}
            onChange={(ev) => onMqttUrlChange(ev.target.value)}
            placeholder={t("settings.placeholder.mqtt")}
            {...fieldAria("mqtt_url", fieldErrors.mqtt_url)}
          />
        </SettingsField>
      </div>
      <details className="ops-platform-details u-mt-field">
        <summary className="ops-platform-details-summary">{t("settings.more.secret")}</summary>
        <div className="form-grid">
          <SettingsField
            label={t("settings.field.secret")}
            name="integration_secret"
            error={fieldErrors.integration_secret}
          >
            <input
              name="integration_secret"
              type="password"
              autoComplete="off"
              value={integrationSecret}
              onChange={(ev) => onIntegrationSecretChange(ev.target.value)}
              placeholder={
                settings?.integration_secret_set
                  ? t("settings.placeholder.set")
                  : t("settings.placeholder.secret")
              }
              {...fieldAria("integration_secret", fieldErrors.integration_secret)}
            />
          </SettingsField>
        </div>
      </details>
    </SettingsSection>
  );
}
