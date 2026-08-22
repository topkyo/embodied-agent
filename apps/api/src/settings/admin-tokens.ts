import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { atomicWriteJson } from "@embodied-agent/platform";
import { dataRoot } from "../fs/deployment-path.js";
import { createLogger, isEncryptedSecret, safeEqualString } from "@embodied-agent/platform";
import { isExplicitDevEnv } from "../runtime/env-mode.js";
import { decryptAdminTokenSection, encryptAdminTokenSection } from "./admin-tokens-crypto.js";
import { assertSettingsSecretsWritable } from "./secrets-at-rest.js";
import { maskApiKey } from "./mask-secret.js";

export type AdminTokenEntry = {
  name: string;
  token: string;
  created_at: string;
  disabled?: boolean;
};

export type PublicAdminTokenEntry = {
  name: string;
  created_at: string;
  disabled?: boolean;
  token_masked?: string;
};

export type AdminTokenFileSection = {
  admin_token?: string;
  admin_tokens?: AdminTokenEntry[];
};

export type AdminTokenMatch = {
  matched: boolean;
  actor?: string;
};

const DEV_ADMIN_TOKEN = "dev-admin";
const ENV_ADMIN_ACTOR = "env:ADMIN_TOKEN";
const LEGACY_ADMIN_ACTOR = "legacy:admin_token";

let legacyAdminTokenWarned = false;

function settingsPath(): string {
  return resolve(dataRoot(), "settings.json");
}

function readSettingsFileRaw(): Record<string, unknown> {
  const path = settingsPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch (e) {
    throw new Error(
      `settings.json 无法读取或校验失败：${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
}

export function readAdminTokenSection(): AdminTokenFileSection {
  const raw = readSettingsFileRaw();
  return decryptAdminTokenSection({
    admin_token: typeof raw.admin_token === "string" ? raw.admin_token : undefined,
    admin_tokens: parseAdminTokens(raw.admin_tokens),
  });
}

function parseAdminTokens(value: unknown): AdminTokenEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries: AdminTokenEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.name !== "string" || typeof row.token !== "string") continue;
    if (typeof row.created_at !== "string") continue;
    entries.push({
      name: row.name.trim(),
      token: row.token,
      created_at: row.created_at,
      disabled: row.disabled === true ? true : undefined,
    });
  }
  return entries.length > 0 ? entries : undefined;
}

export function mergeAdminTokenSectionIntoPersisted(
  persisted: Record<string, unknown>,
): Record<string, unknown> {
  const section = readAdminTokenSection();
  const encrypted = encryptAdminTokenSection(section);
  if (encrypted.admin_token !== undefined) {
    persisted.admin_token = encrypted.admin_token;
  }
  if (encrypted.admin_tokens !== undefined) {
    persisted.admin_tokens = encrypted.admin_tokens;
  }
  return persisted;
}

function writeAdminTokenSection(section: AdminTokenFileSection): void {
  const raw = readSettingsFileRaw();
  const encrypted = encryptAdminTokenSection(section);
  if (encrypted.admin_token !== undefined) {
    raw.admin_token = encrypted.admin_token;
  } else {
    delete raw.admin_token;
  }
  if (encrypted.admin_tokens !== undefined) {
    raw.admin_tokens = encrypted.admin_tokens;
  } else {
    delete raw.admin_tokens;
  }
  assertSettingsSecretsWritable(raw);
  atomicWriteJson(settingsPath(), raw);
}

export function warnLegacyAdminTokenOnStartup(): void {
  if (legacyAdminTokenWarned) return;
  const section = readAdminTokenSection();
  if (!section.admin_token?.trim()) return;
  if (section.admin_tokens && section.admin_tokens.length > 0) return;
  legacyAdminTokenWarned = true;
  createLogger("admin-tokens").warn(
    "settings.json 仍使用旧单值 admin_token；请显式迁移为 admin_tokens 数组（POST /admin/settings/tokens 添加命名 token 后删除 admin_token 字段）。",
    { migration: "admin_token -> admin_tokens[]" },
  );
}

export function resolveAdminTokenCandidates(): Array<{ name: string; token: string }> {
  const candidates: Array<{ name: string; token: string }> = [];
  const section = readAdminTokenSection();

  for (const entry of section.admin_tokens ?? []) {
    if (entry.disabled) continue;
    if (!entry.name.trim() || !entry.token.trim()) continue;
    // 无 AGENT_SECRETS_KEY 时 maybeDecryptSecret 原样返回密文；
    // 密文不得作为可用 bearer token，直接跳过（失败可见于 401）。
    if (isEncryptedSecret(entry.token)) continue;
    candidates.push({ name: entry.name.trim(), token: entry.token });
  }

  const legacy = section.admin_token?.trim();
  if (legacy && !isEncryptedSecret(legacy)) {
    candidates.push({ name: LEGACY_ADMIN_ACTOR, token: legacy });
  }

  const envToken = process.env.ADMIN_TOKEN?.trim();
  if (envToken) {
    candidates.push({ name: ENV_ADMIN_ACTOR, token: envToken });
  } else if (isExplicitDevEnv()) {
    candidates.push({ name: DEV_ADMIN_TOKEN, token: DEV_ADMIN_TOKEN });
  }

  return candidates;
}

export function matchAdminToken(header: string): AdminTokenMatch {
  const candidates = resolveAdminTokenCandidates();
  if (candidates.length === 0) return { matched: false };

  // 遍历全部候选不提前 break（恒时）；值冲突时首个命中（named 优先）作为审计主体，
  // 保证「禁止删除当前请求所用 token」按命名 token 判定。
  let matched = false;
  let actor: string | undefined;
  for (const candidate of candidates) {
    if (safeEqualString(header, candidate.token) && !matched) {
      matched = true;
      actor = candidate.name;
    }
  }
  return matched ? { matched: true, actor } : { matched: false };
}

export function listPublicAdminTokens(): PublicAdminTokenEntry[] {
  const section = readAdminTokenSection();
  return (section.admin_tokens ?? []).map((entry) => ({
    name: entry.name,
    created_at: entry.created_at,
    disabled: entry.disabled,
    token_masked: maskApiKey(entry.token),
  }));
}

export function generateAdminTokenValue(): string {
  return randomBytes(24).toString("base64url");
}

export function addAdminToken(name: string, token: string): AdminTokenEntry {
  const trimmedName = name.trim();
  const trimmedToken = token.trim();
  if (!trimmedName) {
    throw new Error("admin token name 不能为空。");
  }
  if (!trimmedToken) {
    throw new Error("admin token 值不能为空。");
  }

  const section = readAdminTokenSection();
  const existing = section.admin_tokens ?? [];
  if (existing.some((entry) => entry.name === trimmedName)) {
    throw new Error(`admin token 名称已存在：${trimmedName}`);
  }

  const entry: AdminTokenEntry = {
    name: trimmedName,
    token: trimmedToken,
    created_at: new Date().toISOString(),
  };
  writeAdminTokenSection({
    ...section,
    admin_tokens: [...existing, entry],
  });
  return entry;
}

export function removeAdminToken(name: string, currentActor: string | undefined): void {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("admin token name 不能为空。");
  }

  const section = readAdminTokenSection();
  const existing = section.admin_tokens ?? [];
  const target = existing.find((entry) => entry.name === trimmedName);
  if (!target) {
    throw new Error(`admin token 不存在：${trimmedName}`);
  }
  if (currentActor === trimmedName) {
    throw new Error(`不能删除当前请求正在使用的 admin token：${trimmedName}`);
  }

  const next = existing.filter((entry) => entry.name !== trimmedName);
  writeAdminTokenSection({
    ...section,
    admin_tokens: next.length > 0 ? next : undefined,
  });
}

/** @internal tests */
export function resetLegacyAdminTokenWarnForTests(): void {
  legacyAdminTokenWarned = false;
}
