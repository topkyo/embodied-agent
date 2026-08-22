import type { IntentPayload } from "@embodied-agent/core";
import { activeClarificationHandler } from "@embodied-agent/runtime";
import { clearPendingClarification, type PendingClarification } from "./pending-clarification.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";

export type EntityAliasIndex = Record<string, string[]>;

export type MergeResult =
  | { kind: "intent"; intent: IntentPayload }
  | { kind: "notification_pref"; suppress_l2_tonight: true }
  | { kind: "none" };

export function tryMergePendingClarification(
  text: string,
  pending: PendingClarification,
  aliases: EntityAliasIndex,
): MergeResult {
  return (
    activeClarificationHandler(getPlatformRuntimeContext())?.tryMergePendingClarification(
      text,
      pending,
      aliases,
    ) ?? {
      kind: "none",
    }
  );
}

export function inferClarificationFromIntent(
  intent: IntentPayload,
  hint?: string,
): Omit<
  import("./pending-clarification.js").PendingClarification,
  "deployment_id" | "user_id" | "conversation_id" | "created_at" | "expires_at"
> | null {
  const draft = activeClarificationHandler(
    getPlatformRuntimeContext(),
  )?.inferClarificationFromIntent?.(intent, hint);
  if (!draft) return null;
  return {
    expected_skill: draft.expected_skill as IntentPayload["skill"] | undefined,
    missing_slots: [...draft.missing_slots],
    partial: draft.partial,
    last_hint: draft.last_hint,
  };
}

export function finishMergedIntent(user_id: string, conversation_id: string): void {
  clearPendingClarification(user_id, conversation_id);
}
