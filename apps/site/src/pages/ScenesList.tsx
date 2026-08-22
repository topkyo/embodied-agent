import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Badge from "../components/primitives/Badge";
import { useLanguage } from "../contexts/LanguageContext";
import { EXPLORE_SCENE_SLUGS, listWechatExplorePacks } from "../lib/domain-packs";
import {
  fetchPublicDomainPacks,
  type PublicDomainPackCatalogEntry,
  type PublicDomainPacksResponse,
} from "../api";

const MAIN_SCENES = [
  {
    key: "farm",
    packId: "agriculture",
    to: "/scenes/greenhouse",
    badge: "live" as const,
    featured: true,
    thumbClass: "thumb thumb--farm",
    titleKey: "nav.farm",
    descKey: "scenes.farm.desc",
    tagKey: "scenes.farm.tag",
    valueKey: "scenes.farm.value",
    hwKey: "scenes.farm.hw",
  },
  {
    key: "robot",
    packId: "robotics",
    to: "/scenes/robot",
    badge: "live" as const,
    featured: false,
    thumbClass: "thumb thumb--robot",
    titleKey: "scenes.robot.title",
    descKey: "scenes.robot.desc",
    tagKey: "scenes.robot.tag",
    valueKey: "scenes.robot.value",
    hwKey: "scenes.robot.hw",
  },
  {
    key: "industrial",
    packId: "industrial",
    to: "/scenes/industrial",
    badge: "live" as const,
    featured: false,
    thumbClass: "thumb thumb--industrial",
    titleKey: "scenes.industrial.title",
    descKey: "scenes.industrial.desc",
    tagKey: "scenes.industrial.tag",
    valueKey: "scenes.industrial.value",
    hwKey: "scenes.industrial.hw",
  },
  {
    key: "aquaculture",
    packId: "aquaculture",
    to: "/scenes/aquaculture",
    badge: "next" as const,
    featured: false,
    thumbClass: "thumb thumb--aquaculture",
    titleKey: "scenes.aquaculture.title",
    descKey: "scenes.aquaculture.desc",
    tagKey: "scenes.aquaculture.tag",
    valueKey: "scenes.aquaculture.value",
    hwKey: "scenes.aquaculture.hw",
  },
] as const;

function runtimeBadge(
  scene: (typeof MAIN_SCENES)[number],
  runtimeById: Map<string, PublicDomainPackCatalogEntry>,
  catalogLoaded: boolean,
): "live" | "next" | "plan" {
  if (!catalogLoaded) return scene.badge;
  const runtime = runtimeById.get(scene.packId);
  if (!runtime) return scene.badge;
  return runtime.status === "live" ? "live" : "next";
}

function badgeLabelKey(badge: ReturnType<typeof runtimeBadge>): string {
  return badge === "plan" ? "badge.planned" : `badge.${badge}`;
}

export default function ScenesList() {
  const { t } = useLanguage();
  const explorePacks = listWechatExplorePacks();
  const [runtimeCatalog, setRuntimeCatalog] = useState<PublicDomainPacksResponse | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const loadCatalog = useCallback(() => {
    let cancelled = false;
    setCatalogLoading(true);
    setRuntimeError(null);
    fetchPublicDomainPacks()
      .then((catalog) => {
        if (cancelled) return;
        setRuntimeCatalog(catalog);
        setRuntimeError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setRuntimeCatalog(null);
        setRuntimeError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => loadCatalog(), [loadCatalog]);

  const runtimeById = useMemo(
    () => new Map((runtimeCatalog?.catalog ?? []).map((pack) => [pack.id, pack])),
    [runtimeCatalog],
  );
  const catalogLoaded = runtimeCatalog != null;

  return (
    <>
      <header className="page-hero">
        <p className="eyebrow">{t("scenes.eyebrow")}</p>
        <h1 className="display">{t("scenes.title")}</h1>
        <p className="lead">{t("scenes.lead")}</p>
      </header>
      <p className="rank-note">{t("scenes.rank")}</p>
      {catalogLoading && (
        <p className="scene-list-status" aria-live="polite">
          {t("scenes.catalog.loading")}
        </p>
      )}
      {runtimeError && (
        <div className="scene-list-status scene-list-status--error" role="alert">
          <span>
            {t("scenes.catalog.error")}: {runtimeError}
          </span>
          <button type="button" className="btn btn-outline" onClick={() => loadCatalog()}>
            {t("scenes.catalog.retry")}
          </button>
        </div>
      )}
      <div className="scene-list" aria-busy={catalogLoading || undefined}>
        {MAIN_SCENES.map((scene) => {
          const badge = runtimeBadge(scene, runtimeById, catalogLoaded);
          const ctaKey = badge === "live" ? "scenes.enter" : "scenes.preview";
          return (
            <Link
              key={scene.key}
              className={`scene-card${scene.featured ? " featured" : ""}`}
              to={scene.to}
            >
              <div className={scene.thumbClass} />
              <div>
                {catalogLoading ? (
                  <span className="scene-card-badge-skeleton" aria-hidden />
                ) : (
                  <Badge variant={badge}>{t(badgeLabelKey(badge))}</Badge>
                )}
                <h2>{t(scene.titleKey)}</h2>
                <p className="desc">{t(scene.descKey)}</p>
                <p className="value-tag">
                  <strong>{t(scene.tagKey)}</strong>
                  {" · "}
                  {t(scene.valueKey)}
                </p>
                <p className="hw-tag">{t(scene.hwKey)}</p>
              </div>
              <span
                className={`btn ${scene.featured && badge === "live" ? "btn-accent" : "btn-outline"}`}
              >
                {t(ctaKey)}
              </span>
            </Link>
          );
        })}
      </div>
      <p className="rank-note rank-note--spaced">{t("scenes.explore.label")}</p>
      <div className="scene-explore-links">
        {explorePacks.map((pack) => (
          <Link key={pack.slug} to={pack.scenePath} className="chip">
            {t(pack.displayNameKey)}
          </Link>
        ))}
        {EXPLORE_SCENE_SLUGS.map((slug) => (
          <Link key={slug} to={`/scenes/${slug}`} className="chip">
            {t(`scenes.${slug}.title`)}
          </Link>
        ))}
      </div>
    </>
  );
}
