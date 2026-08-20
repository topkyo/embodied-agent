import type { ReactNode } from "react";

export interface OpsPageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}

/** 工作台页面标题区统一入口：左 eyebrow/h1/subtitle，右 actions。 */
export function OpsPageHeader({ title, subtitle, eyebrow, icon, actions }: OpsPageHeaderProps) {
  return (
    <header className="ops-page-header">
      <div className="ops-page-header__main">
        {eyebrow ? <p className="ops-page-header__eyebrow">{eyebrow}</p> : null}
        <h1 className="ops-page-header__title">{title}</h1>
        {subtitle ? <p className="ops-page-header__subtitle muted">{subtitle}</p> : null}
      </div>
      {(icon || actions) && (
        <div className="ops-page-header__aside">
          {icon ? (
            <div className="ops-page-header__icon" aria-hidden="true">
              {icon}
            </div>
          ) : null}
          {actions}
        </div>
      )}
    </header>
  );
}
