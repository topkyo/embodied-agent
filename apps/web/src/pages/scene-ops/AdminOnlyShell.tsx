import { Navigate, useLocation } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { useDomainPack } from "../../contexts/DomainPackContext";
import { useAuth } from "../../contexts/AuthContext";
import { AccessGate } from "../../components/ops/AccessGate";

/**
 * Admin-only ops（review/users/settings/pair）拒绝壳：按 session 角色分流 CTA。
 *   - 匿名 → 直接 redirect /login (state.from = current path)，让 WorkbenchLayout 顶栏 「登录」 承担入口；
 *     （不去 body 弹 「需要管理员权限」 列）
 *   - 已登录但非 admin → AccessGate reason="role_insufficient" primary 「返回场景工作台」 直达 pack.opsPath，
 *     secondary 「返回领域」 回 /start。
 */
export default function AdminOnlyShell({
  eyebrowKey,
  bodyKey,
}: {
  eyebrowKey: string;
  bodyKey: string;
}) {
  const { t } = useLanguage();
  const pack = useDomainPack();
  const { user, isAdmin } = useAuth();
  const location = useLocation();
  const fromPath = `${location.pathname}${location.search || ""}`;

  if (!user) {
    return <Navigate to="/login" state={{ from: fromPath }} replace />;
  }

  if (!isAdmin) {
    return (
      <AccessGate
        reason="role_insufficient"
        eyebrow={t(eyebrowKey)}
        title={t("sceneOps.adminOnly.title")}
        body={t(bodyKey)}
        primaryAction={{
          to: pack.opsPath,
          label: t("sceneOps.adminOnly.backOps"),
        }}
        secondaryAction={{
          to: "/start",
          label: t("nav.backStart"),
        }}
      />
    );
  }

  return null;
}
