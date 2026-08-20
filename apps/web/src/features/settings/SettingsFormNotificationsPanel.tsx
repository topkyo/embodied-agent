import { BellRing } from "lucide-react";
import { SettingsSection } from "./SettingsSection";
import type { TranslateFn } from "./settings-form-types";

export type SettingsFormNotificationsPanelProps = {
  t: TranslateFn;
  nlgEnabled: boolean;
  alertPushEnabled: boolean;
  digestEnabled: boolean;
  weatherProactiveEnabled: boolean;
  showDigestConfig: boolean;
  showWeatherProactiveConfig: boolean;
  onNlgEnabledChange: (value: boolean) => void;
  onAlertPushEnabledChange: (value: boolean) => void;
  onDigestEnabledChange: (value: boolean) => void;
  onWeatherProactiveEnabledChange: (value: boolean) => void;
};

export function SettingsFormNotificationsPanel({
  t,
  nlgEnabled,
  alertPushEnabled,
  digestEnabled,
  weatherProactiveEnabled,
  showDigestConfig,
  showWeatherProactiveConfig,
  onNlgEnabledChange,
  onAlertPushEnabledChange,
  onDigestEnabledChange,
  onWeatherProactiveEnabledChange,
}: SettingsFormNotificationsPanelProps) {
  return (
    <SettingsSection
      id="notifications-config"
      icon={<BellRing size={20} aria-hidden />}
      title={t("settings.section.notifications.title")}
      text={t("settings.section.notifications.desc")}
    >
      <div className="form-grid checkbox-grid">
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="nlg_enabled"
            checked={nlgEnabled}
            onChange={(ev) => onNlgEnabledChange(ev.target.checked)}
          />
          {t("settings.field.nlgEnabled")}
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="alert_push_enabled"
            checked={alertPushEnabled}
            onChange={(ev) => onAlertPushEnabledChange(ev.target.checked)}
          />
          {t("settings.field.alertPushEnabled")}
        </label>
        {showDigestConfig && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              name="digest_enabled"
              checked={digestEnabled}
              onChange={(ev) => onDigestEnabledChange(ev.target.checked)}
            />
            {t("settings.field.digestEnabled")}
          </label>
        )}
        {showWeatherProactiveConfig && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              name="weather_proactive_enabled"
              checked={weatherProactiveEnabled}
              onChange={(ev) => onWeatherProactiveEnabledChange(ev.target.checked)}
            />
            {t("settings.field.weatherProactiveEnabled")}
          </label>
        )}
      </div>
    </SettingsSection>
  );
}
