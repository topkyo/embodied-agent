const seen = new Map<string, number>();
const TTL_MS = 24 * 60 * 60 * 1000;

function dedupKey(account_id: string, from_user_id: string, context_token: string): string {
  return `${account_id}:${from_user_id}:${context_token}`;
}

function pruneSeen(now = Date.now()): void {
  if (seen.size <= 5000) return;
  for (const [k, ts] of seen) {
    if (now - ts > TTL_MS) seen.delete(k);
  }
}

export function isInboundDuplicate(
  account_id: string,
  from_user_id: string,
  context_token: string,
  now = Date.now(),
): boolean {
  const prev = seen.get(dedupKey(account_id, from_user_id, context_token));
  return prev !== undefined && now - prev < TTL_MS;
}

export function markInboundProcessed(
  account_id: string,
  from_user_id: string,
  context_token: string,
  now = Date.now(),
): void {
  seen.set(dedupKey(account_id, from_user_id, context_token), now);
  pruneSeen(now);
}

export function clearInboundDedupForTest(): void {
  seen.clear();
}
