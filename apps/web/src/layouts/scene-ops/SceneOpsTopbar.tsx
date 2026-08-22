import { Link } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { SceneOpsReadinessBadge } from "../../components/scene-ops/SceneOpsReadinessBadge";

type SceneOpsTopbarProps = {
  packName: string;
  adminNav: boolean;
  roleLabel: string;
  base: string;
  onUnbindClick: () => void;
};

export function SceneOpsTopbar({
  packName,
  adminNav,
  roleLabel,
  base,
  onUnbindClick,
}: SceneOpsTopbarProps) {
  const { t } = useLanguage();

  return (
    <div className="ops-console-topbar">
      <span className="ops-console-topbar-title">
        <span className="ops-role-chip" data-role={adminNav ? "admin" : "user"}>
          {roleLabel}
        </span>
        {packName}
      </span>
      <SceneOpsReadinessBadge platformPath={`${base}/platform`} />
      <div className="ops-console-topbar-actions">
        <Link to="/start" className="link-accent-sm">
          {t("nav.backStart")}
        </Link>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onUnbindClick}
          data-testid="ops-unbind-topbar"
        >
          {t("sceneOps.unbind.topbarLabel")}
        </button>
      </div>
    </div>
  );
}
