import { useCallback, useEffect, useState } from "react";
import type { PendingConfirmView } from "../../../api/settings";
import { fetchRecentCommands, type CommandRow } from "../../../api/commands";
import { useLanguage } from "../../../contexts/LanguageContext";
import { useInterval } from "../../../hooks/useInterval";
import { CommandEvidencePanel } from "./CommandEvidencePanel";
import { PendingConfirmsPanel } from "./PendingConfirmsPanel";
import {
  focusProgressStage,
  STAGE_ORDER,
  stagesForCommand,
  type EvidenceStage,
} from "./commandStages";

/** Align with SceneOpsOverview OVERVIEW_POLL_MS so evidence stays in sync with pending. */
const COMMANDS_POLL_MS = 30_000;

export type ActionFlowSectionProps = {
  pending?: PendingConfirmView[];
  onFocusExecutingChange?: (executing: boolean) => void;
};

function ProgressStageNode({
  stage,
  current,
  completed,
}: {
  stage: EvidenceStage;
  current: EvidenceStage;
  completed: EvidenceStage[];
}) {
  const { t } = useLanguage();
  const done = completed.includes(stage);
  const isCurrent = current === stage;
  const stageClass = done
    ? "action-flow-stage--done"
    : isCurrent
      ? "action-flow-stage--current"
      : "";

  return (
    <li
      className={`action-flow-progress-node action-flow-stage ${stageClass}`.trim()}
      data-stage={stage}
    >
      <span className="action-flow-progress-dot" aria-hidden />
      <span className="action-flow-progress-label">{t(`sceneOps.actionFlow.stage.${stage}`)}</span>
    </li>
  );
}

export function ActionFlowSection({ pending, onFocusExecutingChange }: ActionFlowSectionProps) {
  const pendingItems = pending ?? [];
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [enterClass] = useState(() => "action-flow--enter");

  const loadCommands = useCallback(async () => {
    try {
      const res = await fetchRecentCommands(8);
      setCommands(res.commands);
    } catch {
      /* evidence panel shows its own error when self-fetching; band stays at understand */
    }
  }, []);

  useEffect(() => {
    void loadCommands();
  }, [loadCommands, pending, pendingItems.length]);

  useInterval(() => void loadCommands(), COMMANDS_POLL_MS, { visibleOnly: true });

  const { current, completed } = focusProgressStage(pendingItems.length, commands[0]);

  useEffect(() => {
    if (!onFocusExecutingChange) return;
    const executing =
      pendingItems.length === 0 &&
      commands[0] != null &&
      stagesForCommand(commands[0]).current === "execute";
    onFocusExecutingChange(executing);
  }, [pendingItems.length, commands, onFocusExecutingChange]);

  const showProgress = pendingItems.length > 0 || commands.length > 0;

  return (
    <section className={`action-flow ${enterClass}`.trim()} data-testid="action-flow">
      {showProgress ? (
        <ol className="action-flow-progress" data-testid="action-flow-progress">
          {STAGE_ORDER.map((stage) => (
            <ProgressStageNode
              key={stage}
              stage={stage}
              current={current}
              completed={completed}
            />
          ))}
        </ol>
      ) : null}
      <div className="action-flow-grid">
        <PendingConfirmsPanel items={pendingItems} />
        <CommandEvidencePanel commands={commands} />
      </div>
    </section>
  );
}
