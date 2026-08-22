import type { CommandRow } from "../../../api/commands.js";

export type EvidenceStage = "understand" | "confirm" | "execute" | "ack";

export const STAGE_ORDER: readonly EvidenceStage[] = ["understand", "confirm", "execute", "ack"];

/**
 * Maps command `status` heuristically to evidence-chain stages (understand → confirm → execute → ack).
 *
 * Rules (no server state machine):
 * - missing / empty / unknown early status → understand
 * - pending, awaiting_confirm → confirm (WeChat confirmation gate)
 * - created, sent, dispatched, acknowledged, running → execute (in flight on device or transport)
 * - succeeded, success, completed, failed, rejected, timeout → ack (terminal receipt)
 *
 * Missing status never throws; defaults to understand with no completed stages.
 */
export function stagesForCommand(row: CommandRow): {
  current: EvidenceStage;
  completed: EvidenceStage[];
} {
  const status = (row.status ?? "").trim().toLowerCase();

  let current: EvidenceStage;
  if (!status) {
    current = "understand";
  } else if (status === "pending" || status === "awaiting_confirm" || status === "awaiting-confirm") {
    current = "confirm";
  } else if (
    status === "created" ||
    status === "sent" ||
    status === "dispatched" ||
    status === "acknowledged" ||
    status === "running"
  ) {
    current = "execute";
  } else if (
    status === "succeeded" ||
    status === "success" ||
    status === "completed" ||
    status === "failed" ||
    status === "rejected" ||
    status === "timeout"
  ) {
    current = "ack";
  } else {
    current = "understand";
  }

  const idx = STAGE_ORDER.indexOf(current);
  return { current, completed: STAGE_ORDER.slice(0, idx) };
}

export type FocusProgress = {
  current: EvidenceStage;
  completed: EvidenceStage[];
};

/**
 * Single-focus progress band: first pending (confirm stage) else newest command stages.
 */
export function focusProgressStage(
  pendingCount: number,
  newestCommand?: CommandRow | null,
): FocusProgress {
  if (pendingCount > 0) {
    return { current: "confirm", completed: ["understand"] };
  }
  if (newestCommand) {
    return stagesForCommand(newestCommand);
  }
  return { current: "understand", completed: [] };
}
