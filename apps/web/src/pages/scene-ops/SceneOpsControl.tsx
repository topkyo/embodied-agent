import { Banner } from "../../components/primitives/Banner";
import { AccessGate } from "../../components/ops/AccessGate";
import { OpsPageHeader } from "../../components/ops/OpsPageHeader";
import { useLanguage } from "../../contexts/LanguageContext";
import { useSceneOpsReadiness } from "../../contexts/SceneOpsReadinessContext";
import { useDomainPack, useOpsSchema } from "../../contexts/DomainPackContext";
import { DomainPackControlActionsPanel } from "../../features/ops/DomainPackOpsSchemaPanel";
import { humanizeReadinessDetail, humanizeReadinessTitle } from "../../lib/format-display";
import { useAuth } from "../../contexts/AuthContext";
import { resolvePackOpsPanelsFromSchema } from "./pack-ops-registry";

export default function SceneOpsControl() {
  const { t } = useLanguage();
  const pack = useDomainPack();
  const { isAdmin } = useAuth();
  const panels = resolvePackOpsPanelsFromSchema(useOpsSchema(), "control");
  const ControlPanel = panels.ControlPanel;
  const { loading, error, ready, blocked, blockingIssue } = useSceneOpsReadiness();
  const readinessNotice = !ready ? (
    blocked ? (
      <Banner variant="error">
        {t("sceneOps.control.readinessBlocked", {
          label: blockingIssue
            ? humanizeReadinessTitle(blockingIssue, t)
            : t("sceneOps.readiness.blockedBadge"),
          detail: blockingIssue
            ? humanizeReadinessDetail(blockingIssue, t) || t("sceneOps.readiness.blockedHint")
            : t("sceneOps.readiness.blockedHint"),
        })}
      </Banner>
    ) : loading ? (
      <p className="muted">{t("sceneOps.control.readinessChecking")}</p>
    ) : (
      <Banner variant="error">
        {t("sceneOps.control.readinessUnavailable", {
          error: error ?? t("common.unknownError"),
        })}
      </Banner>
    )
  ) : null;

  if (!ControlPanel) {
    return (
      <section className="settings settings-console">
        <OpsPageHeader
          title={t("sceneOps.control.noControl.title")}
          subtitle={t("sceneOps.control.noControl.productHint")}
        />
        {readinessNotice}
        <details className="ops-platform-details">
          <summary className="ops-platform-details-summary">
            {t("sceneOps.control.advancedActions")}
          </summary>
          <p className="muted ops-platform-details-lead">
            {t("sceneOps.control.advancedActionsLead")}
          </p>
          <DomainPackControlActionsPanel />
        </details>
      </section>
    );
  }

  if (panels.controlRequiresInstaller && !isAdmin) {
    return (
      <AccessGate
        reason="role_insufficient"
        title={t("sceneOps.adminOnly.title")}
        body={t("sceneOps.control.noControl.hint")}
        primaryAction={{
          to: pack.opsPath,
          label: t("sceneOps.adminOnly.backOps"),
        }}
      />
    );
  }

  return (
    <section className="settings settings-console">
      <OpsPageHeader
        title={panels.controlTitle ?? t("sceneOps.nav.control")}
        subtitle={panels.controlLead}
      />
      {readinessNotice}
      <ControlPanel />
      <details className="ops-platform-details">
        <summary className="ops-platform-details-summary">
          {t("sceneOps.control.advancedActions")}
        </summary>
        <DomainPackControlActionsPanel />
      </details>
    </section>
  );
}
