export function resolvePrincipalUserId(fromUrl?: string | null, override?: string): string | null {
  const trimmed = override?.trim() || fromUrl?.trim();
  return trimmed || null;
}
