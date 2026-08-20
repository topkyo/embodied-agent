import { listCommands } from "../commands/store.js";

const FAILURE_STATUSES = new Set(["rejected", "failed", "timeout"]);
const WINDOW_MS = 24 * 60 * 60 * 1000;

export function countRecentDeviceFailures(
  device_id: string,
  deployment_id: string,
  now = Date.now(),
): number {
  const cutoff = now - WINDOW_MS;
  return listCommands(deployment_id).filter(
    (r) =>
      r.command.device_id === device_id &&
      FAILURE_STATUSES.has(r.status) &&
      new Date(r.updated_at).getTime() >= cutoff,
  ).length;
}

export function deviceEfficiencyNotifyKey(deployment_id: string, device_id: string): string {
  return `${deployment_id}:${device_id}`;
}
