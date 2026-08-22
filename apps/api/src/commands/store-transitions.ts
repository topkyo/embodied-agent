import type { CommandEvent } from "@embodied-agent/core";
import type { CommandLifecycleStatus } from "./types.js";

export const TERMINAL_STATUSES = new Set<CommandLifecycleStatus>([
  "completed",
  "rejected",
  "failed",
  "timeout",
]);

const EVENT_TRANSITIONS: Partial<
  Record<CommandLifecycleStatus, readonly CommandEvent["status"][]>
> = {
  created: ["acknowledged", "running", "rejected", "failed", "completed"],
  sent: ["acknowledged", "running", "rejected", "failed", "completed"],
  acknowledged: ["running", "rejected", "failed", "completed"],
  running: ["completed", "rejected", "failed"],
};

export function canApplyCommandEvent(
  current: CommandLifecycleStatus,
  next: CommandEvent["status"],
): boolean {
  if (TERMINAL_STATUSES.has(current)) return false;
  const allowed = EVENT_TRANSITIONS[current];
  return allowed?.includes(next) ?? false;
}
