import { Link } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";

export default function NotFound() {
  const { t } = useLanguage();
  return (
    <div className="marketing-shell scene-page">
      <main className="scene-section">
        <p className="eyebrow">404</p>
        <h1>{t("common.error")}</h1>
        <p className="sub">{t("common.unknownError")}</p>
        <Link className="btn btn-primary u-mt-md" to="/">
          {t("nav.platform")}
        </Link>
      </main>
    </div>
  );
}
