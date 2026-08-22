import type { ReactNode } from "react";

export type ProofMetric = {
  label: string;
  value: ReactNode;
};

export type ProofEvent = {
  code: string;
  text: string;
};

export type ProofPanelStatus = "live" | "warn" | "muted";

type ProofPanelProps = {
  title: string;
  statusLabel: string;
  statusTone?: ProofPanelStatus;
  metrics?: ProofMetric[];
  events?: ProofEvent[];
  disclaimer?: string;
  className?: string;
  children?: ReactNode;
};

export default function ProofPanel({
  title,
  statusLabel,
  statusTone = "live",
  metrics = [],
  events = [],
  disclaimer,
  className = "",
  children,
}: ProofPanelProps) {
  return (
    <div className={`proof-panel ${className}`.trim()}>
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
      {metrics.length > 0 && (
        <div className="metric-grid">
          {metrics.map((m) => (
            <div className="metric" key={m.label}>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
            </div>
          ))}
        </div>
      )}
      {events.length > 0 && (
        <div className="event-list">
          {events.map((e) => (
            <div className="event" key={`${e.code}-${e.text}`}>
              <code>{e.code}</code>
              <p>{e.text}</p>
            </div>
          ))}
        </div>
      )}
      {children}
      {disclaimer ? <p className="disclaimer">{disclaimer}</p> : null}
    </div>
  );
}
