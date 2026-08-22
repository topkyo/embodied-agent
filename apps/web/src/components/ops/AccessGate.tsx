import { Link } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";

export type AccessGateReason =
  | "unauthenticated"
  | "role_insufficient"
  | "platform_not_ready"
  | "pack_disabled"
  | "domain_mismatch";

export interface AccessGateProps {
  reason: AccessGateReason;
  packName?: string;
  detail?: string;
  /** 覆盖默认主标题（如沿用 sceneOps.adminOnly.title） */
  title?: string;
  /** 覆盖默认正文 */
  body?: string;
  eyebrow?: string;
  primaryAction?: { to: string; label: string; state?: unknown };
  secondaryAction?: { to: string; label: string; state?: unknown };
}

function defaultCopy(
  reason: AccessGateReason,
  t: (key: string, params?: Record<string, string>) => string,
  detail?: string,
): { title: string; body: string } {
  switch (reason) {
    case "unauthenticated":
      return {
        title: t("sceneOps.platform.deniedTitle"),
        body: detail || t("sceneOps.disabled.adminRequired"),
      };
    case "role_insufficient":
      return {
        title: t("sceneOps.adminOnly.title"),
        body: detail || t("sceneOps.platform.deniedLead"),
      };
    case "platform_not_ready":
      return {
        title: t("sceneOps.access.platformNotReadyTitle"),
        body: detail || t("sceneOps.access.platformNotReadyBody"),
      };
    case "domain_mismatch":
      return {
        title: t("sceneOps.disabled.title"),
        body: detail || t("sceneOps.disabled.inactiveDomain", { current: "missing" }),
      };
    case "pack_disabled":
    default:
      return {
        title: t("sceneOps.disabled.title"),
        body: detail || t("sceneOps.disabled.lead"),
      };
  }
}

/** 统一拒绝/禁用态：未登录、角色不足、pack 禁用、domain 不匹配等。 */
export function AccessGate({
  reason,
  packName,
  detail,
  title,
  body,
  eyebrow,
  primaryAction,
  secondaryAction,
}: AccessGateProps) {
  const { t } = useLanguage();
  const defaults = defaultCopy(reason, t, detail);
  const resolvedTitle = title ?? defaults.title;
  const resolvedBody = body ?? defaults.body;

  return (
    <section
      className="settings settings-console settings-console-narrow access-gate"
      role="alert"
      aria-live="polite"
    >
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1 className="access-gate__title">{resolvedTitle}</h1>
      <p className="muted">{resolvedBody}</p>
      {packName ? <p className="ops-disabled-pack-name">{packName}</p> : null}
      {(primaryAction || secondaryAction) && (
        <div className="actions settings-actions-spaced">
          {primaryAction ? (
            <Link className="btn btn--primary" to={primaryAction.to} state={primaryAction.state}>
              {primaryAction.label}
            </Link>
          ) : null}
          {secondaryAction ? (
            <Link className="btn btn--ghost" to={secondaryAction.to} state={secondaryAction.state}>
              {secondaryAction.label}
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
