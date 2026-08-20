import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  AdminFetchError,
  fetchAlertRules,
  fetchRecentCommands,
  fetchReportSchedules,
  type AlertRuleRow,
  type CommandRow,
  type ReportScheduleRow,
} from "../../api";
import { useLanguage } from "../../contexts/LanguageContext";
import { Banner } from "../../components/primitives/Banner";
import { PanelTitle } from "../../components/primitives/PanelTitle";

export type ReadonlyOpsPanelProps = {
  /** When false, commands block is omitted (overview ActionFlow owns evidence). */
  showCommands?: boolean;
};

/** 运行状态摘要：规则/计划 + 近期指令摘要（非日志倾倒）。 */
export function ReadonlyOpsPanel({ showCommands = true }: ReadonlyOpsPanelProps) {
  const { t } = useLanguage();
  const [rules, setRules] = useState<AlertRuleRow[]>([]);
  const [schedules, setSchedules] = useState<ReportScheduleRow[]>([]);
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [commandsOpen, setCommandsOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [r, s, c] = await Promise.all([
          fetchAlertRules(),
          fetchReportSchedules(),
          showCommands ? fetchRecentCommands(10) : Promise.resolve({ commands: [], count: 0 }),
        ]);
        setRules(r.rules);
        setSchedules(s.schedules.filter((x) => x.enabled));
        setCommands(showCommands ? c.commands : []);
      } catch (e) {
        if (e instanceof AdminFetchError && e.status === 401) {
          setErr(t("api.error.unauthorizedSession"));
        } else {
          setErr(e instanceof Error ? e.message : String(e));
        }
      }
    })();
  }, [showCommands, t]);

  const successCount = commands.filter(
    (c) => c.status === "success" || c.status === "completed",
  ).length;
  const failCount = commands.filter((c) => c.status === "failed" || c.status === "error").length;

  return (
    <section className="settings-panel">
      <PanelTitle
        icon={<ShieldCheck size={20} aria-hidden />}
        title={t("console.ops.title")}
        text={t("console.ops.desc")}
      />
      {err && <Banner variant="error">{err}</Banner>}
      <div className="form-grid u-gap-lg">
        <div>
          <h3 className="ops-subtitle">{t("console.ops.rules")}</h3>
          {rules.length === 0 ? (
            <p className="muted u-text-sm">{t("console.ops.noRules")}</p>
          ) : (
            <ul className="u-list-indented">
              {rules.map((r, i) => (
                <li key={i}>
                  {r.entity_id} {r.metric} {r.operator} {r.value}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="ops-subtitle">{t("console.ops.schedules")}</h3>
          {schedules.length === 0 ? (
            <p className="muted u-text-sm">{t("console.ops.noSchedules")}</p>
          ) : (
            <ul className="u-list-indented">
              {schedules.map((s) => (
                <li key={s.id}>
                  {s.entity_ids.join(", ")} — {s.interval_minutes} min
                </li>
              ))}
            </ul>
          )}
        </div>
        {showCommands ? (
          <div>
            <h3 className="ops-subtitle">{t("console.ops.commands")}</h3>
            {commands.length === 0 ? (
              <p className="muted u-text-sm">{t("console.ops.noCommands")}</p>
            ) : (
              <>
                <p className="u-text-sm u-mb-sm">
                  {t("console.ops.commandsSummary", {
                    total: String(commands.length),
                    ok: String(successCount),
                    fail: String(failCount),
                  })}
                </p>
                <details
                  open={commandsOpen}
                  onToggle={(e) => setCommandsOpen((e.target as HTMLDetailsElement).open)}
                >
                  <summary className="link-accent-sm">{t("console.ops.commandsDetails")}</summary>
                  <ul className="u-list-indented u-mt-sm">
                    {commands.map((c) => (
                      <li key={c.command_id}>
                        <span className="u-mono">{c.command_id.slice(0, 12)}…</span>{" "}
                        <strong>{c.status}</strong> — {c.command.action} {c.command.device_id}
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
