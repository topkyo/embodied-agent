import { FormEvent, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { fetchPilotBaseline, savePilotBaseline, type PilotBaseline } from "../../api";
import { useDomainPackState } from "../../contexts/DomainPackContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { Banner } from "../../components/primitives/Banner";
import { PanelTitle } from "../../components/primitives/PanelTitle";
import { IntentFailuresPanel } from "./IntentFailuresPanel";
import { PilotRoiPanel } from "./PilotRoiPanel";

/** L4 理解飞轮、ROI 与意图失败晋升 — 平台护城河，非棚主日常入口。 */
export function PlatformMoatPanels() {
  const { t } = useLanguage();
  const { catalog, activeDomain } = useDomainPackState();
  /**
   * 跑棚 ROI/基线仅对声明 satellite 能力的 active pack（当前仅温室）展示；
   * 用 capability 而非 packId 字面量，避免平台架构门禁违规。
   * catalog 来自 DomainPackProvider，不独立 fetchDomainPacks。
   */
  const showFieldPilot = useMemo(() => {
    const active =
      catalog.find((entry) => entry.active) ?? catalog.find((entry) => entry.id === activeDomain);
    return Boolean(active?.capabilities?.satellite);
  }, [catalog, activeDomain]);

  const [baseline, setBaseline] = useState<PilotBaseline | null>(null);
  const [runsPerWeek, setRunsPerWeek] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!showFieldPilot) return;
    void (async () => {
      try {
        const res = await fetchPilotBaseline();
        setBaseline(res.baseline);
        if (res.baseline?.manual_run_shed_count_per_week != null) {
          setRunsPerWeek(String(res.baseline.manual_run_shed_count_per_week));
        }
        if (res.baseline?.notes) setNotes(res.baseline.notes);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [showFieldPilot]);

  async function onSaveBaseline(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const patch: { manual_run_shed_count_per_week?: number; notes?: string } = {
        notes: notes.trim() || undefined,
      };
      const n = Number.parseFloat(runsPerWeek);
      if (Number.isFinite(n) && n >= 0) patch.manual_run_shed_count_per_week = n;
      const res = await savePilotBaseline(patch);
      setBaseline(res.baseline);
      setMsg(t("console.flywheel.baselineSaved"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flywheel-panels">
      {err && <Banner variant="error">{err}</Banner>}
      {msg && <Banner variant="ok">{msg}</Banner>}

      {showFieldPilot && (
        <>
          <section className="settings-panel">
            <PanelTitle
              icon={<RefreshCw size={20} aria-hidden />}
              title={t("sceneOps.platform.pilotBaselineTitle")}
              text={t("sceneOps.platform.pilotBaselineDesc")}
            />
            <form className="form-grid" onSubmit={onSaveBaseline}>
              <label>
                {t("console.flywheel.runsPerWeek")}
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={runsPerWeek}
                  onChange={(e) => setRunsPerWeek(e.target.value)}
                  placeholder={
                    baseline ? String(baseline.manual_run_shed_count_per_week ?? "") : ""
                  }
                />
              </label>
              <label className="u-grid-span-full">
                {t("console.flywheel.notes")}
                <input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? "…" : t("console.flywheel.saveBaseline")}
              </button>
            </form>
          </section>
          <PilotRoiPanel />
        </>
      )}
      <IntentFailuresPanel />
    </div>
  );
}
