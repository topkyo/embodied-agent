import { type RefObject } from "react";
import { Menu, X } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import LangSwitcher from "../../components/LangSwitcher";
import { siteUrl } from "../../lib/site-url";

type SceneOpsHeaderProps = {
  drawerOpen: boolean;
  setDrawerOpen: (value: boolean) => void;
  sidebarId: string;
  toggleRef: RefObject<HTMLButtonElement | null>;
};

export function SceneOpsHeader({
  drawerOpen,
  setDrawerOpen,
  sidebarId,
  toggleRef,
}: SceneOpsHeaderProps) {
  const { t } = useLanguage();
  const productHome = siteUrl("/");

  return (
    <header className="top-bar">
      <a href={productHome} className="brand" aria-label={t("nav.productSiteHome")}>
        <span className="brand-mark" aria-hidden>
          EA
        </span>
        {t("brand")}
      </a>
      <div className="top-bar-end">
        <button
          ref={toggleRef}
          type="button"
          className="console-drawer-toggle"
          aria-label={t("console.nav.menu")}
          aria-expanded={drawerOpen}
          aria-controls={sidebarId}
          onClick={() => setDrawerOpen(!drawerOpen)}
        >
          {drawerOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <LangSwitcher />
      </div>
    </header>
  );
}
