import {
  isEncryptedSecret,
  maybeDecryptSecret,
  maybeEncryptSecret,
} from "@embodied-agent/platform";
import { isExplicitDevEnv } from "../runtime/env-mode.js";
import type { AgentSettings } from "./store.js";
import { adminTokenSectionHasPlaintextSecrets } from "./admin-tokens-crypto.js";
import type { AdminTokenFileSection } from "./admin-tokens.js";

const SECRET_FIELDS = [
  "llm_api_key",
  "integration_secret",
  "stt_api_key",
  "stt_app_key",
  "satellite_api_key",
] as const;

type SecretField = (typeof SECRET_FIELDS)[number];

export function decryptSettingsSecrets(file: Partial<AgentSettings>): Partial<AgentSettings> {
  const next = { ...file };
  for (const field of SECRET_FIELDS) {
    const value = next[field];
    if (typeof value === "string") {
      next[field] = maybeDecryptSecret(value);
    }
  }
  return next;
}

export function encryptSettingsSecrets(settings: AgentSettings): AgentSettings {
  const next = { ...settings };
  for (const field of SECRET_FIELDS) {
    const value = next[field];
    if (typeof value === "string" && value.trim()) {
      next[field] = maybeEncryptSecret(value);
    }
  }
  return next;
}

export function settingsHasPlaintextSecrets(file: Record<string, unknown>): boolean {
  for (const field of SECRET_FIELDS) {
    const value = file[field];
    if (typeof value === "string" && value.trim() && !isEncryptedSecret(value)) {
      return true;
    }
  }
  const adminSection: AdminTokenFileSection = {
    admin_token: typeof file.admin_token === "string" ? file.admin_token : undefined,
    admin_tokens: Array.isArray(file.admin_tokens)
      ? (file.admin_tokens as AdminTokenFileSection["admin_tokens"])
      : undefined,
  };
  return adminTokenSectionHasPlaintextSecrets(adminSection);
}

export function assertSettingsSecretsWritable(settings: Record<string, unknown>): void {
  if (isExplicitDevEnv()) return;
  if (!settingsHasPlaintextSecrets(settings)) return;
  if (process.env.AGENT_SECRETS_KEY?.trim()) return;
  throw new Error(
    "生产环境禁止在 settings.json 明文存储密钥；请设置 AGENT_SECRETS_KEY 或改用环境变量（save_target=env_required）。",
  );
}

export type { SecretField };
