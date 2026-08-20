import {
  isEncryptedSecret,
  maybeDecryptSecret,
  maybeEncryptSecret,
} from "@embodied-agent/platform";
import type { AdminTokenFileSection } from "./admin-tokens.js";

export function decryptAdminTokenSection(section: AdminTokenFileSection): AdminTokenFileSection {
  const next: AdminTokenFileSection = { ...section };
  if (typeof next.admin_token === "string") {
    next.admin_token = maybeDecryptSecret(next.admin_token);
  }
  if (next.admin_tokens) {
    next.admin_tokens = next.admin_tokens.map((entry) => ({
      ...entry,
      token: maybeDecryptSecret(entry.token) ?? entry.token,
    }));
  }
  return next;
}

export function encryptAdminTokenSection(section: AdminTokenFileSection): AdminTokenFileSection {
  const next: AdminTokenFileSection = { ...section };
  if (typeof next.admin_token === "string" && next.admin_token.trim()) {
    next.admin_token = maybeEncryptSecret(next.admin_token);
  }
  if (next.admin_tokens) {
    next.admin_tokens = next.admin_tokens.map((entry) => ({
      ...entry,
      token: maybeEncryptSecret(entry.token) ?? entry.token,
    }));
  }
  return next;
}

export function adminTokenSectionHasPlaintextSecrets(section: AdminTokenFileSection): boolean {
  if (typeof section.admin_token === "string" && section.admin_token.trim()) {
    if (!isEncryptedSecret(section.admin_token)) return true;
  }
  for (const entry of section.admin_tokens ?? []) {
    if (entry.token.trim() && !isEncryptedSecret(entry.token)) return true;
  }
  return false;
}
