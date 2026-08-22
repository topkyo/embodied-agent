import { Link } from "react-router-dom";
import DemoPanel from "../components/DemoPanel";
import SceneHero from "../components/SceneHero";
import SceneNav from "../components/SceneNav";
import Badge from "../components/primitives/Badge";
import SiteFooter from "../components/SiteFooter";
import { useLanguage } from "../contexts/LanguageContext";
import { webAppUrl } from "../lib/web-app-url";

export default function SceneIndustrial() {
  const { t } = useLanguage();
  return (
    <div className="marketing-shell scene-page scene-page--industrial">
      <SceneNav />
      <main>
        <SceneHero
          sceneId={t("scene.industrial.id")}
          headline={t("scene.industrial.headline")}
          lead={t("scene.industrial.lead")}
          badge={
            <>
              <Badge variant="live">{t("badge.live")}</Badge>
              <span>{t("scene.industrial.badge")}</span>
              <a href="#pilot">{t("scene.industrial.boundary")}</a>
            </>
          }
          actions={
            <>
              <a className="btn btn-primary" href="#demo">
                {t("platform.cta.demo")}
              </a>
              <a className="btn btn-ghost" href={webAppUrl("/start?pack=industrial")}>
                {t("platform.cta.wechat")}
              </a>
              <Link className="btn btn-ghost" to="/nodes#io-rack">
                {t("scene.industrial.hw")}
              </Link>
            </>
          }
        />
        <section className="scene-section">
          <p className="eyebrow">{t("scene.industrial.trio.eyebrow")}</p>
          <h2>{t("scene.industrial.trio")}</h2>
          <p className="sub">{t("scene.industrial.trioSub")}</p>
          <div className="grid-3 grid-cards-loose">
            <div className="trio-card">
              <div className="num">{t("scene.industrial.trio.n1")}</div>
              <h3>{t("scene.industrial.t1")}</h3>
              <p>{t("scene.industrial.t1d")}</p>
            </div>
            <div className="trio-card">
              <div className="num">{t("scene.industrial.trio.n2")}</div>
              <h3>{t("scene.industrial.t2")}</h3>
              <p>{t("scene.industrial.t2d")}</p>
            </div>
            <div className="trio-card">
              <div className="num">{t("scene.industrial.trio.n3")}</div>
              <h3>{t("scene.industrial.t3")}</h3>
              <p>{t("scene.industrial.t3d")}</p>
            </div>
          </div>
        </section>
        <DemoPanel sceneSlug="industrial" />
        <section className="scene-section alt" id="pilot">
          <p className="eyebrow">{t("scene.industrial.boundaryTitle")}</p>
          <h2>{t("scene.industrial.boundaryH")}</h2>
          <p className="sub">{t("scene.industrial.boundarySub")}</p>
        </section>
        <SiteFooter left={t("scene.industrial.footer")} />
      </main>
    </div>
  );
}
