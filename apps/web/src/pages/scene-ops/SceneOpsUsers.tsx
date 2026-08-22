import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { OpsPageHeader } from "../../components/ops/OpsPageHeader";
import { UserManagementPanel } from "../../features/ops/UserManagementPanel";
import { WebAccountPanel } from "../../features/ops/WebAccountPanel";
import AdminOnlyShell from "./AdminOnlyShell";

/** 人员页：主路径 = 运维台用户；现场操作员放折叠区。 */
export default function SceneOpsUsers() {
  const { t } = useLanguage();
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return <AdminOnlyShell eyebrowKey="console.nav.users" bodyKey="sceneOps.adminOnly.users" />;
  }

  return (
    <section className="settings settings-console">
      <OpsPageHeader
        title={t("sceneOps.users.productTitle")}
        subtitle={t("sceneOps.users.productLead")}
      />

      <section className="settings-panel">
        <WebAccountPanel />
      </section>

      <details className="ops-platform-details">
        <summary className="ops-platform-details-summary">
          {t("sceneOps.users.fieldPrincipalsAdvanced")}
        </summary>
        <p className="muted ops-platform-details-lead">{t("sceneOps.users.fieldPrincipalsLead")}</p>
        <UserManagementPanel />
      </details>
    </section>
  );
}
