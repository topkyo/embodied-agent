import type { ReactNode } from "react";

export function StatusCard({
  icon,
  label,
  value,
  ok,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <article className={ok ? "console-status-card ok" : "console-status-card warn"}>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
