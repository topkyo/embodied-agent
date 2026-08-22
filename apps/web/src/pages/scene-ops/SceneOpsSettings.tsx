import { SceneSettingsForm } from "../../features/settings/SceneSettingsForm";
import { useAuth } from "../../contexts/AuthContext";
import { useOpsSchema } from "../../contexts/DomainPackContext";
import { DomainPackSettingsSchemaPanel } from "../../features/ops/DomainPackOpsSchemaPanel";
import { OpsPageHeader } from "../../components/ops/OpsPageHeader";
import { useLanguage } from "../../contexts/LanguageContext";
import { resolvePackOpsPanelsFromSchema } from "./pack-ops-registry";
import AdminOnlyShell from "./AdminOnlyShell";

export default function SceneOpsSettings() {
  const { t } = useLanguage();
  const { isAdmin } = useAuth();
  const panels = resolvePackOpsPanelsFromSchema(useOpsSchema(), "settings");
  const SettingsPanel = panels.SettingsPanel;

  if (!isAdmin) {
    return (
      <AdminOnlyShell eyebrowKey="sceneOps.nav.settings" bodyKey="sceneOps.adminOnly.settings" />
    );
  }

  if (SettingsPanel) {
    return (
      <section className="settings settings-console">
        <OpsPageHeader
          title={panels.settingsTitle ?? t("settings.scope.scene.title")}
          subtitle={panels.settingsLead ?? t("settings.scope.scene.lead")}
        />
        <SettingsPanel />
        <details className="ops-platform-details settings settings-console">
          <summary className="ops-platform-details-summary">
            {t("sceneOps.settings.advancedSchema")}
          </summary>
          <DomainPackSettingsSchemaPanel />
        </details>
      </section>
    );
  }

  return (
    <>
      <SceneSettingsForm />
      <section className="settings settings-console settings-console-flush">
        <details className="ops-platform-details">
          <summary className="ops-platform-details-summary">
            {t("sceneOps.settings.advancedSchema")}
          </summary>
          <p className="muted ops-platform-details-lead">
            {t("sceneOps.settings.advancedSchemaLead")}
          </p>
          <DomainPackSettingsSchemaPanel />
        </details>
      </section>
    </>
  );
}
