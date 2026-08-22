import { Navigate, useLocation } from "react-router-dom";
import type { DomainPackMeta } from "../../lib/domain-packs";
import { sceneOpsEntryPath } from "../../lib/domain-packs";
import { useLanguage } from "../../contexts/LanguageContext";
import { AccessGate, type AccessGateReason } from "../../components/ops/AccessGate";
import { AsyncState } from "../../components/ops/AsyncState";

export type SceneOpsDisabledReason =
  | "unknown"
  | "disabled"
  | "checking_active_domain"
  | "catalog_error"
  | "inactive_domain"
  | "admin_required";

function mapReason(reason: SceneOpsDisabledReason): AccessGateReason {
  switch (reason) {
    case "admin_required":
      return "unauthenticated";
    case "inactive_domain":
      return "domain_mismatch";
    case "unknown":
    case "disabled":
    case "catalog_error":
    case "checking_active_domain":
    default:
      return "pack_disabled";
  }
}

/** 仍在 SceneOpsLayout 中作为 disabled 壳的 reason 映射使用；新独立页面优先直接用 AccessGate / AsyncState。 */
export default function SceneOpsDisabled({
  pack,
  reason,
  detail,
}: {
  pack?: DomainPackMeta;
  reason: SceneOpsDisabledReason;
  detail?: string;
}) {
  const { t } = useLanguage();
  const loginReturnTo = (pack && sceneOpsEntryPath(pack)) || "/start";
  const packName = pack ? t(pack.displayNameKey) : undefined;
  const location = useLocation();
  const fromPath = `${location.pathname}${location.search || ""}`;

  /**
   * admin_required → 匿名访问 admin-only ops。该 column 不再 放在 body 内，顶部 WorkbenchLayout
   * 「登录」 link 是唯一的入口；保留 为 兼容旧调用 走 <Navigate> redirect，所以 单测 / 旧的 caller 还可用。
   */
  if (reason === "admin_required") {
    return <Navigate to="/login" state={{ from: fromPath || loginReturnTo }} replace />;
  }

  if (reason === "checking_active_domain") {
    return (
      <section className="settings settings-console ops-disabled-shell">
        <AsyncState loading />
      </section>
    );
  }

  let body: string | undefined;
  switch (reason) {
    case "unknown":
      body = t("sceneOps.disabled.unknownPack");
      break;
    case "catalog_error":
      body = t("sceneOps.disabled.catalogError", { detail: detail ?? "" });
      break;
    case "inactive_domain":
      body = t("sceneOps.disabled.inactiveDomain", {
        current: detail ?? "missing",
      });
      break;
    case "disabled":
    default:
      body = t("sceneOps.disabled.lead");
      break;
  }

  return (
    <AccessGate
      reason={mapReason(reason)}
      packName={packName}
      eyebrow={t("sceneOps.nav.label")}
      title={t("sceneOps.disabled.title")}
      body={body}
      primaryAction={{
        to: "/start",
        label: t("sceneOps.disabled.back"),
      }}
      secondaryAction={
        pack?.opsEnabled ? { to: pack.opsPath, label: t("sceneOps.adminOnly.backOps") } : undefined
      }
    />
  );
}
