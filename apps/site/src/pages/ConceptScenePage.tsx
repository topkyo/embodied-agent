import { Link } from "react-router-dom";
import SceneHero from "../components/SceneHero";
import SceneNav from "../components/SceneNav";
import Badge from "../components/primitives/Badge";
import SiteFooter from "../components/SiteFooter";
import { useLanguage } from "../contexts/LanguageContext";
import { webAppUrl } from "../lib/web-app-url";

export type ConceptSceneBadgeVariant = "next" | "plan" | "explore";

export type ConceptScenePageConfig = {
  slug: string;
  badgeVariant?: ConceptSceneBadgeVariant;
  showBadgeText?: boolean;
  showBoundaryLink?: boolean;
  showTrio?: boolean;
  showActions?: boolean;
  showWechatCta?: boolean;
  heroChildren?: boolean;
};

type ConceptScenePageProps = {
  config: ConceptScenePageConfig;
};

function badgeVariantLabel(variant: ConceptSceneBadgeVariant, t: (key: string) => string): string {
  if (variant === "next") return t("badge.next");
  if (variant === "plan") return t("badge.planned");
  return t("badge.explore");
}

export default function ConceptScenePage({ config }: ConceptScenePageProps) {
  const { t } = useLanguage();
  const prefix = `scene.${config.slug}`;
  const badgeVariant = config.badgeVariant ?? "explore";

  const badge = (
    <>
      <Badge variant={badgeVariant}>{badgeVariantLabel(badgeVariant, t)}</Badge>
      {config.showBadgeText ? <span>{t(`${prefix}.badge`)}</span> : null}
      {config.showBoundaryLink ? <a href="#boundary">{t(`${prefix}.boundary`)}</a> : null}
    </>
  );

  const actions =
    config.heroChildren || config.showActions === false ? undefined : (
      <>
        <Link className="btn btn-primary" to="/scenes">
          {t(`${prefix}.cta`)}
        </Link>
        <Link className="btn btn-ghost" to="/nodes#sensor-hub">
          {t(`${prefix}.hw`)}
        </Link>
      </>
    );

  const heroProps = {
    sceneId: t(`${prefix}.id`),
    headline: t(`${prefix}.headline`),
    lead: t(`${prefix}.lead`),
    badge,
    actions,
    ...(config.heroChildren
      ? {
          children: (
            <div className="actions u-mt-20">
              <a className="btn btn-primary" href={webAppUrl("/start")}>
                {t(`${prefix}.cta`)}
              </a>
            </div>
          ),
        }
      : {}),
  };

  return (
    <div className={`marketing-shell scene-page scene-page--${config.slug}`}>
      <SceneNav />
      <main>
        <p className="muted concept-disclaimer u-text-sm" role="note">
          {t("scenes.concept.disclaimer")}
        </p>
        <SceneHero {...heroProps} />
        {config.showTrio ? (
          <section className="scene-section">
            <p className="eyebrow">{t(`${prefix}.trio.eyebrow`)}</p>
            <h2>{t(`${prefix}.trio`)}</h2>
            <p className="sub">{t(`${prefix}.trioSub`)}</p>
            <div className="grid-3 grid-cards-loose">
              {[1, 2, 3].map((n) => (
                <div className="trio-card" key={n}>
                  <div className="num">{t(`${prefix}.trio.n${n}`)}</div>
                  <h3>{t(`${prefix}.t${n}`)}</h3>
                  <p>{t(`${prefix}.t${n}d`)}</p>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="scene-section">
            <p className="eyebrow">{t(`${prefix}.section`)}</p>
            <h2>{t(`${prefix}.sectionH`)}</h2>
            <p className="sub">{t(`${prefix}.sectionSub`)}</p>
            {config.showWechatCta ? null : (
              <Link className="btn btn-outline u-mt-md" to="/scenes">
                {t("scene.nav.back")}
              </Link>
            )}
          </section>
        )}
        {config.showTrio ? (
          <section className="scene-section alt" id="boundary">
            <p className="eyebrow">{t(`${prefix}.boundaryTitle`)}</p>
            <h2>{t(`${prefix}.boundaryH`)}</h2>
            <p className="sub">{t(`${prefix}.boundarySub`)}</p>
          </section>
        ) : null}
        <SiteFooter left={t(`${prefix}.footer`)} />
      </main>
    </div>
  );
}
