const tokens = new Map<string, string>();

export function contextKey(accountId: string, platformUserId: string): string {
  return `${accountId}:${platformUserId}`;
}

export function setWechatContextToken(
  accountId: string,
  platformUserId: string,
  contextToken: string,
): void {
  tokens.set(contextKey(accountId, platformUserId), contextToken);
}

export function getWechatContextToken(
  accountId: string,
  platformUserId: string,
): string | undefined {
  return tokens.get(contextKey(accountId, platformUserId));
}
