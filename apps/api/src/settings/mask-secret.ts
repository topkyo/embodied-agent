export function maskApiKey(key?: string): string | undefined {
  if (!key) return undefined;
  if (key.length <= 8) return "********";
  return `${"*".repeat(Math.min(key.length - 4, 12))}${key.slice(-4)}`;
}
