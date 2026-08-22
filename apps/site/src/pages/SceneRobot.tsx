import { Link } from "react-router-dom";
import DemoPanel from "../components/DemoPanel";
import SceneHero from "../components/SceneHero";
import SceneNav from "../components/SceneNav";
import Badge from "../components/primitives/Badge";
import SiteFooter from "../components/SiteFooter";
import { useLanguage } from "../contexts/LanguageContext";
import { webAppUrl } from "../lib/web-app-url";

export default function SceneRobot() {
  const { t } = useLanguage();
  return (
    <div className="marketing-shell scene-page scene-page--robot">
      <SceneNav />
      <main>
        <SceneHero
          sceneId={t("scene.robot.id")}
          headline={t("scene.robot.headline")}
          lead={t("scene.robot.lead")}
          badge={
            <>
              <Badge variant="live">{t("badge.live")}</Badge>
              <span>{t("scene.robot.badge")}</span>
            </>
          }
          actions={
            <>
              <a className="btn btn-primary" href="#demo">
                {t("platform.cta.demo")}
              </a>
              <a className="btn btn-ghost" href={webAppUrl("/start?pack=robot")}>
                {t("platform.cta.wechat")}
              </a>
              <Link className="btn btn-ghost" to="/nodes">
                {t("scene.robot.hw")}
              </Link>
            </>
          }
        />
        <DemoPanel sceneSlug="robot" />
        <SiteFooter left={t("scene.robot.footer")} />
      </main>
    </div>
  );
}
