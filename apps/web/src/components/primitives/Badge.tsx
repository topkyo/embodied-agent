import type { ReactNode } from "react";

export type BadgeVariant = "live" | "next" | "plan" | "explore";

type BadgeProps = {
  variant: BadgeVariant;
  children: ReactNode;
  className?: string;
};

export default function Badge({ variant, children, className = "" }: BadgeProps) {
  return <span className={`badge badge-${variant} ${className}`.trim()}>{children}</span>;
}
