import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { safeEqualString } from "@embodied-agent/platform";
import { atomicWriteJson } from "@embodied-agent/platform";
import { withFileLock } from "../../fs/file-lock.js";
import { dataRoot } from "../../fs/deployment-path.js";
import type { WebAccount, WebAccountsFile, WebRole } from "./types.js";

function accountsPath(): string {
  return resolve(dataRoot(), "auth", "web-users.json");
}

function accountsLockPath(): string {
  return resolve(dataRoot(), "auth", "web-users.json.lock");
}

function emptyFile(): WebAccountsFile {
  return { bootstrap_redeemed: false, users: [] };
}

function readAccountsFile(): WebAccountsFile {
  const path = accountsPath();
  if (!existsSync(path)) return emptyFile();
  const parsed = JSON.parse(readFileSync(path, "utf8")) as WebAccountsFile;
  if (!parsed || !Array.isArray(parsed.users)) {
    throw new Error(`${path} 格式无效`);
  }
  return {
    bootstrap_redeemed: Boolean(parsed.bootstrap_redeemed),
    users: parsed.users,
  };
}

function writeAccountsFile(file: WebAccountsFile): void {
  const path = accountsPath();
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteJson(path, file);
}

export function listWebAccounts(): WebAccount[] {
  return readAccountsFile().users;
}

export function findWebAccountById(userId: string): WebAccount | undefined {
  return listWebAccounts().find((u) => u.user_id === userId);
}

export function findWebAccountByEmail(email: string): WebAccount | undefined {
  const normalized = email.trim().toLowerCase();
  return listWebAccounts().find((u) => u.email?.trim().toLowerCase() === normalized);
}

export function hasWebAdmin(): boolean {
  return listWebAccounts().some((u) => u.role === "admin");
}

export function isBootstrapRedeemed(): boolean {
  return readAccountsFile().bootstrap_redeemed;
}

type UpsertInput = {
  user_id?: string;
  role: WebRole;
  display_name: string;
  email?: string;
  password_hash?: string;
};

function upsertUnlocked(input: UpsertInput): WebAccount {
  const file = readAccountsFile();
  const userId = input.user_id?.trim() || `web-${randomUUID()}`;
  const existingIdx = file.users.findIndex((u) => u.user_id === userId);
  const existing = existingIdx >= 0 ? file.users[existingIdx] : undefined;
  const next: WebAccount = {
    user_id: userId,
    role: input.role,
    display_name: input.display_name.trim() || userId,
    created_at: existing?.created_at ?? new Date().toISOString(),
    ...(input.email?.trim() ? { email: input.email.trim().toLowerCase() } : {}),
    ...(input.password_hash ? { password_hash: input.password_hash } : {}),
  };
  if (existingIdx >= 0) {
    file.users[existingIdx] = {
      ...existing!,
      ...next,
      created_at: existing!.created_at,
      password_hash: next.password_hash ?? existing!.password_hash,
      email: next.email ?? existing!.email,
    };
  } else {
    file.users.push(next);
  }
  writeAccountsFile(file);
  return existingIdx >= 0 ? file.users[existingIdx]! : next;
}

export async function upsertWebAccount(input: UpsertInput): Promise<WebAccount> {
  return withFileLock(accountsLockPath(), () => upsertUnlocked(input));
}

export async function markBootstrapRedeemed(): Promise<void> {
  await withFileLock(accountsLockPath(), () => {
    const file = readAccountsFile();
    file.bootstrap_redeemed = true;
    writeAccountsFile(file);
  });
}

export async function redeemBootstrapAdminLocked(
  installCode: string,
  expectedInstallCode: string,
  opts: {
    displayName?: string;
    email: string;
    password_hash: string;
  },
): Promise<WebAccount | { error: string }> {
  return withFileLock(accountsLockPath(), () => {
    if (isBootstrapRedeemed() || hasWebAdmin()) {
      return { error: "bootstrap_already_redeemed" };
    }
    if (!safeEqualString(installCode.trim(), expectedInstallCode)) {
      return { error: "invalid_install_code" };
    }
    const email = opts.email.trim().toLowerCase();
    if (findWebAccountByEmail(email)) {
      return { error: "email_already_exists" };
    }
    const account = upsertUnlocked({
      role: "admin",
      display_name: opts.displayName?.trim() || "Admin",
      user_id: "admin",
      email,
      password_hash: opts.password_hash,
    });
    const file = readAccountsFile();
    file.bootstrap_redeemed = true;
    writeAccountsFile(file);
    return account;
  });
}

export function resolveBootstrapInstallCode(): string | undefined {
  return process.env.WEB_INSTALL_CODE?.trim() || undefined;
}
