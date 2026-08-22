import { Link } from "react-router-dom";
import { greenhouseMetricNumber } from "../lib/greenhouse-telemetry";
import DemoPanel from "../components/DemoPanel";
import SceneNav from "../components/SceneNav";
import SceneHero from "../components/SceneHero";
import WechatClawbotPanel from "../components/primitives/WechatClawbotPanel";
import type { ProofPanelStatus } from "../components/primitives/ProofPanel";
import Badge from "../components/primitives/Badge";
import SiteFooter from "../components/SiteFooter";
import { useLanguage } from "../contexts/LanguageContext";
import { type DemoTelemetryMode, useDemoOverview } from "../hooks/useDemoOverview";
import { webAppUrl } from "../lib/web-app-url";

const SKILLS = [
  ["high_temp_emergency_response", "scene.gh.skill1", "L2"],
  ["humidity_mildew_prevention", "scene.gh.skill2", "L2"],
  ["night_ventilation_control", "scene.gh.skill3", "L2"],
  ["post_irrigation_ventilation", "scene.gh.skill4", "L2"],
  ["cold_wave_protection", "scene.gh.skill5", "L2"],
  ["morning_dew_reduction", "scene.gh.skill6", "L1"],
  ["device_efficiency_diagnosis", "scene.gh.skill7", "L1"],
] as const;

const PLACEHOLDER = "—";

function statusToneForMode(mode: DemoTelemetryMode): ProofPanelStatus {
  if (mode === "live") return "live";
  if (mode === "stale") return "warn";
  return "muted";
}

function panelMetric(mode: DemoTelemetryMode, liveFormatted: string | null): string {
  if (mode === "loading") return PLACEHOLDER;
  return liveFormatted ?? PLACEHOLDER;
}

export default function SceneGreenhouse() {
  const { t } = useLanguage();
  // Single DEMO_READONLY overview for Hero + DemoPanel (no admin-token).
  const overview = useDemoOverview("greenhouse");
  const { entity: liveGh, mode } = overview;

  const tempNum = greenhouseMetricNumber(liveGh, "temperature_c");
  const humidNum = greenhouseMetricNumber(liveGh, "humidity_percent");
  const temp = panelMetric(mode, tempNum != null ? `${tempNum.toFixed(1)}°C` : null);
  const humid = panelMetric(mode, humidNum != null ? `${humidNum.toFixed(0)}%` : null);

  const statusLabel =
    mode === "loading"
      ? t("landing.console.statusLoading")
      : mode === "live"
        ? t("landing.console.status")
        : mode === "stale"
          ? t("landing.console.statusStale")
          : mode === "unconfigured"
            ? t("demo.status.unconfigured")
            : t("console.overview.noTelemetry");

  const disclaimer =
    mode === "stale"
      ? `${t("landing.console.statusStale")} · ${t("scene.gh.disclaimer")}`
      : t("scene.gh.disclaimer");

  const chatMessages = [
    { role: "user" as const, text: t("scene.gh.chat.user1") },
    {
      role: "bot" as const,
      text: t("scene.gh.chat.bot1", { temp, humid }),
    },
    { role: "user" as const, text: t("scene.gh.chat.user2") },
    { role: "bot" as const, text: t("scene.gh.chat.bot2") },
    { role: "user" as const, text: t("scene.gh.chat.user3") },
    { role: "bot" as const, text: t("scene.gh.chat.bot3") },
  ];

  return (
    <div className="marketing-shell scene-page scene-page--greenhouse">
      <SceneNav />
      <main>
        <SceneHero
          variant="greenhouse"
          sceneId={t("scene.gh.id")}
          headline={`${t("scene.gh.headline1")}\n${t("scene.gh.headline2")}`}
          lead={t("scene.gh.lead")}
          badge={
            <>
              <Badge variant="live">{t("scene.gh.badge")}</Badge>
              <span>gh-001 / gh-002</span>
              <a href="#pilot">{t("scene.gh.pilotLink")}</a>
            </>
          }
          actions={
            <>
              <a className="btn btn-primary" href="#demo">
                {t("platform.cta.demo")}
              </a>
              <a className="btn btn-ghost" href={webAppUrl("/start?pack=greenhouse")}>
                {t("platform.cta.wechat")}
              </a>
              <Link className="btn btn-ghost" to="/">
                {t("scene.gh.ctaPlatform")}
              </Link>
            </>
          }
        >
          <WechatClawbotPanel
            title={t("scene.gh.panel.title")}
            statusLabel={statusLabel}
            statusTone={statusToneForMode(mode)}
            entityLabel={liveGh?.entity_id ?? "gh-001 / gh-002"}
            temp={temp}
            humid={humid}
            messages={chatMessages}
            disclaimer={disclaimer}
          />
        </SceneHero>

        <section className="scene-section">
          <p className="eyebrow">{t("scene.gh.trio.eyebrow")}</p>
          <h2>{t("scene.gh.trio.title")}</h2>
          <p className="sub">{t("scene.gh.trio.sub")}</p>
          <div className="grid-3 grid-cards-loose">
            <div className="trio-card">
              <div className="num">{t("scene.gh.trio.n1")}</div>
              <h3>{t("scene.gh.trio1")}</h3>
              <p>{t("scene.gh.trio1d")}</p>
            </div>
            <div className="trio-card">
              <div className="num">{t("scene.gh.trio.n2")}</div>
              <h3>{t("scene.gh.trio2")}</h3>
              <p>{t("scene.gh.trio2d")}</p>
            </div>
            <div className="trio-card">
              <div className="num">{t("scene.gh.trio.n3")}</div>
              <h3>{t("scene.gh.trio3")}</h3>
              <p>{t("scene.gh.trio3d")}</p>
            </div>
          </div>
        </section>

        <DemoPanel sceneSlug="greenhouse" overview={overview} />

        <section className="scene-section dark">
          <p className="eyebrow on-dark">{t("scene.gh.skills.eyebrow")}</p>
          <h2>{t("scene.gh.skills.title")}</h2>
          <p className="sub">{t("scene.gh.skills.sub")}</p>
          <div>
            {SKILLS.map(([code, key, level]) => (
              <div key={code} className="skill-row">
                <code>{code}</code>
                <span>{t(key)}</span>
                <span>{level}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="scene-section alt" id="pilot">
          <p className="eyebrow">{t("scene.gh.pilot.eyebrow")}</p>
          <h2>{t("scene.gh.pilot.title")}</h2>
          <p className="sub">{t("scene.gh.pilot.sub")}</p>
          <div className="grid-2 grid-cards-loose">
            <div className="trio-card">
              <h3>{t("scene.gh.pilot.min")}</h3>
              <p className="pilot-card-desc">{t("scene.gh.pilot.minDesc")}</p>
            </div>
            <div className="trio-card pilot-card-highlight">
              <h3>{t("scene.gh.pilot.ok")}</h3>
              <p className="pilot-card-desc">
                {t("scene.gh.pilot.okDesc")}{" "}
                <a href={webAppUrl("/scenes/greenhouse/ops/users")} className="link-accent">
                  {t("scene.gh.pilot.users")}
                </a>
              </p>
            </div>
          </div>
          <p className="pilot-footer">
            {t("scene.gh.pilot.back")}{" "}
            <Link to="/" className="link-accent-strong">
              {t("scene.gh.pilot.home")}
            </Link>
          </p>
        </section>

        <SiteFooter
          left={t("scene.gh.footer")}
          right={<a href={webAppUrl("/scenes/greenhouse/ops")}>{t("scene.gh.footerOps")}</a>}
        />
      </main>
    </div>
  );
}
