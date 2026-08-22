import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import ProofPanel from "../components/primitives/ProofPanel";
import StackCard from "../components/primitives/StackCard";
import LoopStrip from "../components/primitives/LoopStrip";
import SiteFooter from "../components/SiteFooter";
import { useHeroNavTheme } from "../hooks/useHeroNavTheme";
import { useLanguage } from "../contexts/LanguageContext";
import { webAppUrl } from "../lib/web-app-url";
import greenhouseHeroImg from "../assets/greenhouse-aiot-hero.jpg";
import robotCardImg from "../assets/vision/card-robot.jpg";
import industrialCardImg from "../assets/vision/card-industrial.jpg";

const PlatformHeroCanvas = lazy(() => import("../components/PlatformHeroCanvas"));

const LIVE_EVIDENCE = [
  {
    slug: "greenhouse",
    titleKey: "platform.evidence.greenhouse.title",
    descKey: "platform.evidence.greenhouse.desc",
    image: greenhouseHeroImg,
  },
  {
    slug: "robot",
    titleKey: "platform.evidence.robot.title",
    descKey: "platform.evidence.robot.desc",
    image: robotCardImg,
  },
  {
    slug: "industrial",
    titleKey: "platform.evidence.industrial.title",
    descKey: "platform.evidence.industrial.desc",
    image: industrialCardImg,
  },
] as const;

function HeroCanvasFallback() {
  return <div className="platform-canvas platform-canvas--static" aria-hidden />;
}

export default function PlatformHome() {
  const heroRef = useHeroNavTheme(true);
  const { t } = useLanguage();

  return (
    <>
      <header className="hero-platform" ref={heroRef}>
        <Suspense fallback={<HeroCanvasFallback />}>
          <PlatformHeroCanvas />
        </Suspense>
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="eyebrow">{t("platform.eyebrow")}</p>
            <h1 className="display">
              {t("platform.headline1")}
              <br />
              {t("platform.headline2")}
            </h1>
            <p className="lead on-dark">{t("platform.lead")}</p>
            <div className="actions">
              <Link className="btn btn-primary" to="/scenes">
                {t("platform.cta.scenes")}
              </Link>
              <a className="btn btn-ghost" href={webAppUrl("/start")}>
                {t("platform.cta.wechat")}
              </a>
            </div>
            <ProofPanel
              title={t("platform.panel.title")}
              statusLabel={t("platform.panel.status")}
              statusTone="muted"
              metrics={[
                { label: t("platform.panel.agent"), value: t("platform.panel.agentVal") },
                { label: t("platform.panel.node"), value: t("platform.panel.nodeVal") },
                { label: t("platform.panel.skill"), value: t("platform.panel.skillVal") },
              ]}
              events={[
                { code: t("platform.panel.e1code"), text: t("platform.panel.e1") },
                { code: t("platform.panel.e2code"), text: t("platform.panel.e2") },
                { code: t("platform.panel.e3code"), text: t("platform.panel.e3") },
              ]}
              disclaimer={t("platform.panel.disclaimer")}
            />
          </div>
        </div>
      </header>

      <section className="section full">
        <div className="section section-nested">
          <div className="section-head">
            <p className="eyebrow">{t("platform.evidence.eyebrow")}</p>
            <h2 className="section-title">{t("platform.evidence.title")}</h2>
            <p className="lead">{t("platform.evidence.lead")}</p>
          </div>
          <div className="grid-3 grid-cards-loose">
            {LIVE_EVIDENCE.map((item) => (
              <div className="trio-card" key={item.slug}>
                <img
                  className="trio-card-img"
                  src={item.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
                <h3>{t(item.titleKey)}</h3>
                <p>{t(item.descKey)}</p>
                <div className="actions u-mt-md">
                  <Link className="btn btn-outline" to={`/scenes/${item.slug}#demo`}>
                    {t("platform.cta.demo")}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section full alt">
        <div className="section section-nested">
          <div className="section-head">
            <p className="eyebrow">{t("platform.delivery.eyebrow")}</p>
            <h2 className="section-title">{t("platform.delivery.title")}</h2>
            <p className="lead">{t("platform.delivery.lead")}</p>
          </div>
          <div className="grid-4">
            <StackCard num="01 Agent" title={t("platform.stack.agent")}>
              {t("platform.stack.agentDesc")}
            </StackCard>
            <StackCard num="02 Node" title={t("platform.stack.node")}>
              {t("platform.stack.nodeDesc")}{" "}
              <Link to="/nodes" className="link-accent">
                {t("platform.stack.nodeLink")}
              </Link>
            </StackCard>
            <StackCard num="03 Skills" title={t("platform.stack.skills")}>
              {t("platform.stack.skillsDesc")}
            </StackCard>
            <StackCard num="04 Memory" title={t("platform.stack.memory")}>
              {t("platform.stack.memoryDesc")}
            </StackCard>
          </div>
        </div>
      </section>

      <section className="section full">
        <div className="section section-nested">
          <div className="section-head">
            <p className="eyebrow">{t("platform.loop.eyebrow")}</p>
            <h2 className="section-title">{t("platform.loop.title")}</h2>
            <div className="section-lead-duo">
              <p className="lead-punch">{t("platform.loop.leadPunch")}</p>
              <p className="lead-flow">{t("platform.loop.leadFlow")}</p>
            </div>
          </div>
          <LoopStrip
            steps={[
              { index: "01", title: t("platform.loop.s1"), description: t("platform.loop.s1d") },
              { index: "02", title: t("platform.loop.s2"), description: t("platform.loop.s2d") },
              { index: "03", title: t("platform.loop.s3"), description: t("platform.loop.s3d") },
              { index: "04", title: t("platform.loop.s4"), description: t("platform.loop.s4d") },
              { index: "05", title: t("platform.loop.s5"), description: t("platform.loop.s5d") },
              { index: "06", title: t("platform.loop.s6"), description: t("platform.loop.s6d") },
            ]}
          />
        </div>
      </section>

      <section className="section dark full">
        <div className="section section-nested">
          <div className="section-head">
            <p className="eyebrow on-dark">{t("platform.roadmap.eyebrow")}</p>
            <h2 className="section-title">{t("platform.roadmap.title")}</h2>
            <p className="lead on-dark">{t("platform.roadmap.lead")}</p>
          </div>
          <div className="flywheel-grid">
            <div>
              {(["L1", "L2", "L3", "L4"] as const).map((id) => (
                <div key={id} className="fly-step">
                  <span className="fly-step-id">{id}</span>
                  <div>
                    <h4>{t(`platform.flywheel.${id.toLowerCase()}Title`)}</h4>
                    <p>{t(`platform.flywheel.${id.toLowerCase()}Desc`)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="telemetry-card">
              <p className="muted on-dark">{t("platform.roadmap.note")}</p>
              <div className="telemetry-row">
                <span>{t("platform.flywheel.rowUser")}</span>
                <a href={webAppUrl("/start")}>{t("platform.flywheel.rowGo")}</a>
              </div>
              <div className="telemetry-row">
                <span>{t("platform.flywheel.rowOps")}</span>
                <a href={webAppUrl("/start")}>{t("platform.flywheel.rowGo")}</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter
        left={t("platform.footer")}
        right={<a href={webAppUrl("/start")}>{t("platform.footerWorkbench")}</a>}
      />
    </>
  );
}
