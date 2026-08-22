export type { PendingConfirmView } from "../../../api/settings.js";

import type { PendingConfirmView } from "../../../api/settings.js";

/** Milliseconds until expires_at; clamped to 0 when already expired. */
export function remainingMs(item: PendingConfirmView, nowMs: number = Date.now()): number {
  return Math.max(0, item.expires_at - nowMs);
}

/** mm:ss under 1h; whole minutes when longer. */
export function formatRemainingMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  if (totalSeconds >= 3600) {
    return `${Math.ceil(totalSeconds / 60)} min`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function isPendingConfirmExpired(
  item: PendingConfirmView,
  nowMs: number = Date.now(),
): boolean {
  return item.expires_at <= nowMs;
}

/** Client-side filter mirroring API unexpired-only list (for polling refresh). */
export function filterActivePendingConfirms(
  items: PendingConfirmView[],
  nowMs: number = Date.now(),
): PendingConfirmView[] {
  return items.filter((item) => !isPendingConfirmExpired(item, nowMs));
}
