import { Link } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import LangSwitcher from "./LangSwitcher";

export default function SceneNav() {
  const { t } = useLanguage();
  return (
    <nav className="nav-scene" aria-label={t("scene.nav.aria")}>
      <Link to="/scenes" className="nav-scene-back">
        {t("scene.nav.back")}
      </Link>
      <div className="nav-scene-end">
        <LangSwitcher className="lang-switcher--nav" />
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden>
            EA
          </span>
          <span>{t("brand")}</span>
        </Link>
      </div>
    </nav>
  );
}
