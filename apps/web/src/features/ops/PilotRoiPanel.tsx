import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { fetchPilotRoi, type PilotRoiSummary } from "../../api";
import { useLanguage } from "../../contexts/LanguageContext";
import { PanelTitle } from "../../components/primitives/PanelTitle";
import { Banner } from "../../components/primitives/Banner";

export function PilotRoiPanel() {
  const { t } = useLanguage();
  const [roi, setRoi] = useState<PilotRoiSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setRoi(await fetchPilotRoi(7));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <section className="settings-panel">
      <PanelTitle
        icon={<CheckCircle2 size={20} aria-hidden />}
        title={t("console.roi.title")}
        text={t("console.roi.desc")}
      />
      {err && <Banner variant="error">{err}</Banner>}
      {roi ? (
        <p className="muted u-text-sm">{roi.summary_text}</p>
      ) : (
        <p className="muted u-text-sm">{t("common.loading")}</p>
      )}
    </section>
  );
}
