import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { fetchSceneOutcomes, type SceneOutcomeRow } from "../../api";
import { useLanguage } from "../../contexts/LanguageContext";
import { PanelTitle } from "../../components/primitives/PanelTitle";
import { Banner } from "../../components/primitives/Banner";
import { formatLocalizedDateTime, formatSceneSkillDisplayName } from "../../lib/format-display";

function formatOutcomeMetrics(
  metrics: Record<string, unknown>,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  const parts: string[] = [];
  if (typeof metrics.temperature_delta_c === "number") {
    parts.push(
      t("sceneOps.review.outcomes.deltaT", {
        value: metrics.temperature_delta_c.toFixed(1),
      }),
    );
  }
  if (typeof metrics.humidity_delta === "number") {
    parts.push(
      t("sceneOps.review.outcomes.deltaH", {
        value: metrics.humidity_delta.toFixed(1),
      }),
    );
  } else if (typeof metrics.humidity_delta_percent === "number") {
    parts.push(
      t("sceneOps.review.outcomes.deltaH", {
        value: metrics.humidity_delta_percent.toFixed(1),
      }),
    );
  }
  return parts.length > 0 ? ` ${parts.join(" · ")}` : "";
}

export function SceneOutcomesPanel() {
  const { t, lang } = useLanguage();
  const [outcomes, setOutcomes] = useState<SceneOutcomeRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchSceneOutcomes({ limit: 20, since_days: 7 });
        setOutcomes(res.outcomes);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <section className="settings-panel">
      <PanelTitle
        icon={<CheckCircle2 size={20} aria-hidden />}
        title={t("sceneOps.review.outcomes.title")}
        text={t("sceneOps.review.outcomes.lead")}
      />
      {err && <Banner variant="error">{err}</Banner>}
      {outcomes.length === 0 ? (
        <p className="muted u-text-sm">{t("sceneOps.review.outcomes.empty")}</p>
      ) : (
        <ul className="u-list-indented">
          {outcomes.map((o) => {
            const when = formatLocalizedDateTime(o.ts, lang);
            const skill = formatSceneSkillDisplayName(o.scene_skill_id, t);
            const status = o.success
              ? t("sceneOps.review.outcomes.ok")
              : t("sceneOps.review.outcomes.fail");
            const entity = o.entity_id ? ` · ${o.entity_id}` : "";
            const metrics = formatOutcomeMetrics(o.metrics, t);
            return (
              <li key={`${o.ts}-${o.command_id ?? o.scene_skill_id}`}>
                <span className="muted u-text-sm">{when}</span>
                {" · "}
                <strong>{skill}</strong>
                {entity}
                {" · "}
                {status}
                {metrics}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
