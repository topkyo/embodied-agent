import { useCallback, useEffect, useState } from "react";
import { Bot } from "lucide-react";
import {
  fetchIntentFailures,
  promoteAllIntentFailuresWechat,
  promoteIntentFailureWechat,
  type IntentFailureRow,
} from "../../api";
import { useLanguage } from "../../contexts/LanguageContext";
import { formatPromoteFeedback, promoteErrorMessage } from "../../lib/intent-failures-promote";
import { Banner } from "../../components/primitives/Banner";
import { PanelTitle } from "../../components/primitives/PanelTitle";

export function IntentFailuresPanel() {
  const { t } = useLanguage();
  const [cases, setCases] = useState<IntentFailureRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promotingAll, setPromotingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetchIntentFailures({ promoted: false });
      setCases(res.cases);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handlePromote(id: string) {
    setPromotingId(id);
    setMsg(null);
    setErr(null);
    try {
      const res = await promoteIntentFailureWechat(id);
      const feedback = formatPromoteFeedback(res, t);
      setMsg(feedback.msg);
      setErr(feedback.err);
      await load();
    } catch (e) {
      setErr(promoteErrorMessage(e));
    } finally {
      setPromotingId(null);
    }
  }

  async function handlePromoteAll() {
    setPromotingAll(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await promoteAllIntentFailuresWechat();
      const feedback = formatPromoteFeedback(res, t);
      setMsg(feedback.msg);
      setErr(feedback.err);
      await load();
    } catch (e) {
      setErr(promoteErrorMessage(e));
    } finally {
      setPromotingAll(false);
    }
  }

  const promotableCount = cases.filter((c) => c.promotable).length;

  return (
    <section className="settings-panel">
      <PanelTitle
        icon={<Bot size={20} aria-hidden />}
        title={t("settings.section.intentFailures.title")}
        text={t("settings.section.intentFailures.desc")}
      />
      <div className="settings-actions u-mb-md">
        <button
          type="button"
          className="btn secondary"
          onClick={() => void load()}
          disabled={loading}
        >
          {t("settings.intentFailures.btn.refresh")}
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => void handlePromoteAll()}
          disabled={promotingAll || promotableCount === 0}
          aria-busy={promotingAll}
        >
          {promotingAll
            ? t("settings.intentFailures.promoting")
            : t("settings.intentFailures.btn.promoteAll")}
        </button>
      </div>
      {err && <Banner variant="error">{err}</Banner>}
      {msg && <Banner variant="ok">{msg}</Banner>}
      {loading && cases.length === 0 ? (
        <p className="muted u-text-sm">…</p>
      ) : cases.length === 0 ? (
        <p className="muted u-text-sm">{t("settings.intentFailures.empty")}</p>
      ) : (
        <div className="ops-table-wrap">
          <table className="ops-data-table">
            <thead>
              <tr>
                <th>{t("settings.intentFailures.col.utterance")}</th>
                <th>{t("settings.intentFailures.col.kind")}</th>
                <th>{t("settings.intentFailures.col.confidence")}</th>
                <th>{t("settings.intentFailures.col.platform")}</th>
                <th>{t("settings.intentFailures.col.recorded")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td className="u-cell-utterance">{c.utterance}</td>
                  <td>{c.failure_kind}</td>
                  <td>{c.confidence}</td>
                  <td>{c.platform ?? "—"}</td>
                  <td className="u-nowrap">{c.recorded_at.slice(0, 16).replace("T", " ")}</td>
                  <td>
                    {c.promotable ? (
                      <button
                        type="button"
                        className="btn secondary btn-compact"
                        disabled={promotingId === c.id || promotingAll}
                        onClick={() => void handlePromote(c.id)}
                      >
                        {promotingId === c.id
                          ? t("settings.intentFailures.promoting")
                          : t("settings.intentFailures.btn.promote")}
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
