import { MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import type { PendingConfirmView } from "../../../api/settings";
import { PanelTitle } from "../../../components/primitives/PanelTitle";
import { useLanguage } from "../../../contexts/LanguageContext";
import { formatRemainingMs, remainingMs } from "./projectPendingConfirm.js";

export type PendingConfirmsPanelProps = {
  items: PendingConfirmView[];
};

export function PendingConfirmsPanel({ items }: PendingConfirmsPanelProps) {
  const { t } = useLanguage();

  return (
    <section className="action-flow-panel action-flow-panel--pending">
      <PanelTitle
        icon={<MessageCircle size={18} aria-hidden />}
        title={t("sceneOps.actionFlow.pendingTitle")}
        text=""
      />
      {items.length === 0 ? (
        <div className="action-flow-empty">
          <p>{t("sceneOps.actionFlow.pendingEmpty")}</p>
          <p className="muted u-text-sm">{t("sceneOps.actionFlow.pendingEmptyHint")}</p>
        </div>
      ) : (
        <ul className="action-flow-pending-list">
          {items.map((item) => (
            <li
              key={`${item.user_id}-${item.created_at}`}
              className="action-flow-pending-item"
              data-testid="pending-confirm-row"
            >
              <span className="action-flow-pending-action">{item.action_summary}</span>
              <span className="action-flow-pending-target muted">{item.target_summary}</span>
              <span className="action-flow-pending-remaining muted u-text-sm">
                {t("sceneOps.actionFlow.remaining", {
                  time: formatRemainingMs(remainingMs(item)),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="action-flow-cta">
        <Link to="/start" className="link-accent-sm">
          {t("sceneOps.actionFlow.confirmInWechat")}
        </Link>
      </p>
    </section>
  );
}
