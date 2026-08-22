import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { fetchRecentCommands, type CommandRow } from "../../../api";
import { Banner } from "../../../components/primitives/Banner";
import { PanelTitle } from "../../../components/primitives/PanelTitle";
import { useLanguage } from "../../../contexts/LanguageContext";
import { formatLocalizedDateTime } from "../../../lib/format-display";
import { isRobotCommand } from "./shared";

export function RobotReviewPanel() {
  const { t, lang } = useLanguage();
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchRecentCommands(50)
      .then((res) => setCommands(res.commands.filter(isRobotCommand)))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <section className="settings-panel">
      <PanelTitle
        icon={<RotateCcw size={20} aria-hidden />}
        title={t("sceneOps.robot.panel.review.title")}
        text={t("sceneOps.robot.panel.review.text")}
      />
      {error && <Banner variant="error">{error}</Banner>}
      <ul className="robot-command-list">
        {commands.map((cmd) => (
          <li key={cmd.command_id} className="robot-review-item">
            <span className={cmd.status === "completed" ? "pill pill--ok" : "pill pill--warn"}>
              {cmd.status}
            </span>{" "}
            <strong>{cmd.command.action}</strong> · {cmd.command.device_id} ·{" "}
            {cmd.execution_transport ?? "unknown"} / {cmd.lifecycle_source ?? "unknown"} ·{" "}
            {formatLocalizedDateTime(cmd.updated_at, lang)}
          </li>
        ))}
      </ul>
      {commands.length === 0 && (
        <p className="muted u-text-sm">{t("sceneOps.robot.panel.review.empty")}</p>
      )}
    </section>
  );
}
