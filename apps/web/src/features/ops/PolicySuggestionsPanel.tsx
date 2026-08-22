import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  applyPolicySuggestionAdmin,
  fetchPolicySuggestions,
  type PolicySuggestionRow,
} from "../../api";
import { useLanguage } from "../../contexts/LanguageContext";
import { PanelTitle } from "../../components/primitives/PanelTitle";
import { Banner } from "../../components/primitives/Banner";

export function PolicySuggestionsPanel() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<PolicySuggestionRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchPolicySuggestions();
      setRows(res.suggestions.filter((s) => s.status === "pending"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="settings-panel">
      <PanelTitle
        icon={<ShieldCheck size={20} aria-hidden />}
        title={t("sceneOps.review.policy.title")}
        text={t("sceneOps.review.policy.lead")}
      />
      {err && <Banner variant="error">{err}</Banner>}
      {msg && <Banner variant="ok">{msg}</Banner>}
      {rows.length === 0 ? (
        <p className="muted u-text-sm">{t("sceneOps.review.policy.empty")}</p>
      ) : (
        <ul className="u-list-indented">
          {rows.map((s) => (
            <li key={s.id} className="u-mb-sm">
              {s.reason}{" "}
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  void (async () => {
                    try {
                      await applyPolicySuggestionAdmin(s.id);
                      setMsg(t("sceneOps.review.policy.applied"));
                      await load();
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : String(e));
                    }
                  })();
                }}
              >
                {t("sceneOps.review.policy.apply")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
