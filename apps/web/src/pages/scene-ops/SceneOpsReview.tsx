import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useDomainPack } from "../../contexts/DomainPackContext";
import { AccessGate } from "../../components/ops/AccessGate";
import { OpsPageHeader } from "../../components/ops/OpsPageHeader";
import { PolicySuggestionsPanel } from "../../features/ops/PolicySuggestionsPanel";
import { SceneOutcomesPanel } from "../../features/ops/SceneOutcomesPanel";
import { useOpsSchema } from "../../contexts/DomainPackContext";
import { resolvePackOpsPanelsFromSchema } from "./pack-ops-registry";

/** 本场景 L3 效果复盘 + 可采纳策略建议（安装人员）；用户日常在微信收结果。 */
export default function SceneOpsReview() {
  const { t } = useLanguage();
  const pack = useDomainPack();
  const { isAdmin } = useAuth();
  const panels = resolvePackOpsPanelsFromSchema(useOpsSchema(), "review");
  const ReviewPanel = panels.ReviewPanel;

  if (!isAdmin) {
    return (
      <AccessGate
        reason="role_insufficient"
        eyebrow={t("sceneOps.nav.review")}
        title={t("sceneOps.adminOnly.title")}
        body={t("sceneOps.adminOnly.review")}
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
        eyebrow={t("sceneOps.nav.review")}
        title={t("sceneOps.review.title")}
        subtitle={t("sceneOps.review.lead")}
      />

      {ReviewPanel ? (
        <ReviewPanel />
      ) : (
        <>
          <SceneOutcomesPanel />
          <PolicySuggestionsPanel />
        </>
      )}
    </section>
  );
}
