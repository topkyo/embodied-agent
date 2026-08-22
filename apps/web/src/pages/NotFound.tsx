import { Link } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";

/**
 * 工作台 404：apps/web 仅有 /login、/start、/scenes/:slug/ops/*（/start/wechat 仅作兼容壳）。
 * 旧营销路径（如 /scenes/greenhouse）已迁至 apps/site，勿链到 scenePath。
 */
export default function NotFound() {
  const { t } = useLanguage();
  return (
    <div className="marketing-shell scene-page">
      <main className="scene-section">
        <p className="eyebrow">404</p>
        <h1>{t("notFound.title")}</h1>
        <p className="sub">{t("notFound.lead")}</p>
        <div className="actions u-mt-md">
          <Link className="btn btn-primary" to="/start">
            {t("notFound.toStart")}
          </Link>
          <Link className="btn btn-ghost" to="/login">
            {t("notFound.toLogin")}
          </Link>
        </div>
      </main>
    </div>
  );
}
