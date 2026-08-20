import type { ProofPanelStatus } from "./ProofPanel";

type WechatClawbotPanelProps = {
  title: string;
  statusLabel: string;
  statusTone?: ProofPanelStatus;
  entityLabel: string;
  temp: string;
  humid: string;
  messages: Array<{ role: "user" | "bot" | "push"; text: string }>;
  disclaimer?: string;
  className?: string;
};

export default function WechatClawbotPanel({
  title,
  statusLabel,
  statusTone = "live",
  entityLabel,
  temp,
  humid,
  messages,
  disclaimer,
  className = "",
}: WechatClawbotPanelProps) {
  return (
    <div className={`wechat-clawbot-panel ${className}`.trim()} aria-label={title}>
      <div className="panel-top">
        <span>{title}</span>
        <span
          className={`status-dot status-dot--${statusTone}`}
          role="status"
          aria-label={statusLabel}
        >
          {statusLabel}
        </span>
      </div>
      <div className="wechat-clawbot-meta">
        <span>{entityLabel}</span>
        <span>
          {temp} · {humid}
        </span>
      </div>
      <div className="wechat-clawbot-chat">
        {messages.map((msg, i) => (
          <p
            key={`${msg.role}-${i}`}
            className={`wechat-clawbot-bubble wechat-clawbot-bubble--${msg.role}`}
          >
            {msg.text}
          </p>
        ))}
      </div>
      {disclaimer ? <p className="disclaimer">{disclaimer}</p> : null}
    </div>
  );
}
