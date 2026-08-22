import { useLanguage } from "../../contexts/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";
import { type DomainPackMeta } from "../../lib/domain-packs";
import { AccessGate } from "../../components/ops/AccessGate";

/**
 * 平台底座 拒绝壳：按 session 角色分流 CTA。
 *   - 匿名  → AccessGate reason="unauthenticated" + CTA 「管理员登录」 /login
 *   - 已登录但非 admin → AccessGate reason="role_insufficient" + CTA 「返回场景工作台」直达 pack.opsPath
 *   （不能引导去 /login：登录表单不能把 user 拉到 admin 角色。）
 */
export default function SceneOpsPlatformDenied({ pack }: { pack?: DomainPackMeta }) {
  const { t } = useLanguage();
  const { user, isAdmin } = useAuth();
  const opsPath = pack?.opsEnabled ? pack.opsPath : "/start";

  if (!user) {
    return (
      <AccessGate
        reason="unauthenticated"
        eyebrow={t("sceneOps.nav.platform")}
        title={t("sceneOps.platform.deniedTitle")}
        body={t("sceneOps.disabled.adminRequired")}
        primaryAction={{
          to: "/login",
          label: t("sceneOps.platform.deniedCta"),
          state: { from: opsPath },
        }}
        secondaryAction={{
          to: pack?.opsEnabled ? pack.opsPath : "/start",
          label: t("sceneOps.adminOnly.backOps"),
        }}
      />
    );
  }

  if (!isAdmin) {
    return (
      <AccessGate
        reason="role_insufficient"
        eyebrow={t("sceneOps.nav.platform")}
        title={t("sceneOps.adminOnly.title")}
        body={t("sceneOps.platform.deniedLead")}
        primaryAction={{
          to: pack?.opsEnabled ? pack.opsPath : "/start",
          label: t("sceneOps.adminOnly.backOps"),
        }}
        secondaryAction={{
          to: "/start",
          label: t("nav.backStart"),
        }}
      />
    );
  }

  // 兜底：理论上 SceneOpsPlatformGate 没传到这里
  return null;
}
