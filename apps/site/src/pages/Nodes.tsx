import { Link } from "react-router-dom";
import { useHeroNavTheme } from "../hooks/useHeroNavTheme";
import { useLanguage } from "../contexts/LanguageContext";

const PRODUCTS = [
  {
    id: "edge-control",
    visual: "exec",
    visualKey: "nodes.p.edge.visual",
    titleKey: "nodes.p.edge",
    socKey: "nodes.p.edge.soc",
    roleKey: "nodes.p.edgeDesc",
    periphKeys: ["nodes.p.edge.p1", "nodes.p.edge.p2", "nodes.p.edge.p3"],
    link: "/scenes/greenhouse",
    linkKey: "nodes.p.edgeLink",
  },
  {
    id: "io-rack",
    visual: "io",
    visualKey: "nodes.p.io.visual",
    titleKey: "nodes.p.io",
    socKey: "nodes.p.io.soc",
    roleKey: "nodes.p.ioDesc",
    periphKeys: ["nodes.p.io.p1", "nodes.p.io.p2", "nodes.p.io.p3"],
    link: "/scenes/industrial",
    linkKey: "nodes.p.ioLink",
  },
  {
    id: "sensor-hub",
    visual: "sensor",
    visualKey: "nodes.p.sensor.visual",
    titleKey: "nodes.p.sensor",
    socKey: "nodes.p.sensor.soc",
    roleKey: "nodes.p.sensorDesc",
    periphKeys: ["nodes.p.sensor.p1", "nodes.p.sensor.p2", "nodes.p.sensor.p3"],
    link: "/scenes/greenhouse",
    linkKey: "nodes.p.sensorLink",
  },
  {
    id: "vision-edge",
    visual: "vision",
    visualKey: "nodes.p.vision.visual",
    titleKey: "nodes.p.vision",
    socKey: "nodes.p.vision.soc",
    roleKey: "nodes.p.visionDesc",
    periphKeys: ["nodes.p.vision.p1", "nodes.p.vision.p2", "nodes.p.vision.p3"],
    link: "/scenes/industrial",
    linkKey: "nodes.p.visionLink",
  },
] as const;

export default function Nodes() {
  const heroRef = useHeroNavTheme(true);
  const { t } = useLanguage();

  return (
    <>
      <header className="page-hero page-hero--dark" ref={heroRef}>
        <p className="eyebrow">{t("nodes.hero.eyebrow")}</p>
        <h1>{t("nodes.hero.title")}</h1>
        <p className="lead">{t("nodes.hero.lead")}</p>
      </header>

      <section className="scene-section">
        <p className="eyebrow">{t("nodes.section.exec")}</p>
        <h2>{t("nodes.section.execH")}</h2>
        <p className="sub">{t("nodes.section.execSub")}</p>
        <div className="product-grid">
          {PRODUCTS.map((p) => (
            <article className="product" id={p.id} key={p.id}>
              <div className={`product-visual ${p.visual}`}>{t(p.visualKey)}</div>
              <div>
                <div className="product-head">
                  <h3>{t(p.titleKey)}</h3>
                  <span className="soc">{t(p.socKey)}</span>
                </div>
                <p className="role">{t(p.roleKey)}</p>
                <div>
                  {p.periphKeys.map((key) => (
                    <span className="periph" key={key}>
                      {t(key)}
                    </span>
                  ))}
                </div>
                <p className="u-mt-field">
                  <Link className="demo-link" to={p.link}>
                    {t(p.linkKey)}
                  </Link>
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
