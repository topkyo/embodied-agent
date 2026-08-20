import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { fetchRecentCommands, type CommandRow } from "../../../api/commands";
import { Banner } from "../../../components/primitives/Banner";
import { PanelTitle } from "../../../components/primitives/PanelTitle";
import { useLanguage } from "../../../contexts/LanguageContext";
import { STAGE_ORDER, stagesForCommand } from "./commandStages";

export type CommandEvidencePanelProps = {
  /** When provided, skips self-fetch (ActionFlowSection owns polling). */
  commands?: CommandRow[];
};

function EvidenceStageChips({ row }: { row: CommandRow }) {
  const { t } = useLanguage();
  const { current, completed } = stagesForCommand(row);

  return (
    <span className="action-flow-stages">
      {STAGE_ORDER.map((stage) => {
        const done = completed.includes(stage);
        const isCurrent = current === stage;
        const stageClass = done
          ? "action-flow-stage--done"
          : isCurrent
            ? "action-flow-stage--current"
            : "";
        return (
          <span key={stage} className={`pill action-flow-stage ${stageClass}`.trim()}>
            {t(`sceneOps.actionFlow.stage.${stage}`)}
          </span>
        );
      })}
    </span>
  );
}

export function CommandEvidencePanel({ commands: commandsProp }: CommandEvidencePanelProps) {
  const { t } = useLanguage();
  const [commandsLocal, setCommandsLocal] = useState<CommandRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (commandsProp !== undefined) return;
    void (async () => {
      try {
        setErr(null);
        const res = await fetchRecentCommands(8);
        setCommandsLocal(res.commands);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [commandsProp]);

  const commands = commandsProp ?? commandsLocal;

  return (
    <section className="action-flow-panel action-flow-panel--evidence">
      <PanelTitle
        icon={<ClipboardList size={18} aria-hidden />}
        title={t("sceneOps.actionFlow.evidenceTitle")}
        text=""
      />
      {err ? <Banner variant="error">{err}</Banner> : null}
      {commands.length === 0 && !err ? (
        <p className="muted u-text-sm action-flow-empty">
          {t("sceneOps.actionFlow.evidenceEmpty")}
        </p>
      ) : (
        <ul className="action-flow-evidence-list">
          {commands.map((cmd) => (
            <li
              key={cmd.command_id}
              className="action-flow-evidence-item"
              data-testid="command-evidence-row"
            >
              <EvidenceStageChips row={cmd} />
              <div className="action-flow-evidence-meta">
                <strong>{cmd.command.action}</strong>
                <span className="muted">· {cmd.command.device_id}</span>
                {cmd.result?.actual_duration_seconds != null ? (
                  <span className="muted">· {cmd.result.actual_duration_seconds}s</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
