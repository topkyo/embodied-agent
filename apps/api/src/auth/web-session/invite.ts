import { randomUUID } from "node:crypto";
import type { InviteRecord, WebRole } from "./types.js";
import { ephemeralDel, ephemeralGetJson, ephemeralSetJson } from "./ephemeral-store.js";

const NS = "web-invite";
const INVITE_TTL_SECONDS = 24 * 60 * 60;

export async function issueInviteToken(
  createdBy: string,
  role: WebRole = "user",
): Promise<InviteRecord> {
  const now = Date.now();
  const record: InviteRecord = {
    token: randomUUID(),
    role,
    created_by: createdBy,
    created_at: now,
    expires_at: now + INVITE_TTL_SECONDS * 1000,
  };
  await ephemeralSetJson(NS, record.token, record, INVITE_TTL_SECONDS);
  return record;
}

export async function getInviteToken(token: string): Promise<InviteRecord | null> {
  const normalized = token.trim();
  if (!normalized) return null;
  const row = await ephemeralGetJson<InviteRecord>(NS, normalized);
  if (!row) return null;
  if (row.redeemed_at) return null;
  if (Date.now() > row.expires_at) {
    await ephemeralDel(NS, normalized);
    return null;
  }
  return row;
}

export async function redeemInviteToken(
  token: string,
  redeemedBy: string,
): Promise<InviteRecord | null> {
  const row = await getInviteToken(token);
  if (!row) return null;
  const updated: InviteRecord = {
    ...row,
    redeemed_at: Date.now(),
    redeemed_by: redeemedBy,
  };
  const remaining = Math.max(1, Math.ceil((row.expires_at - Date.now()) / 1000));
  await ephemeralSetJson(NS, row.token, updated, remaining);
  return updated;
}
