import {
  findWebAccountByEmail,
  redeemBootstrapAdminLocked,
  resolveBootstrapInstallCode,
  upsertWebAccount,
} from "./accounts.js";
import { assertPasswordPolicy, hashPassword, verifyPassword } from "./password.js";
import { createWebSession } from "./session.js";
import type { WebAccount, WebRole } from "./types.js";

export async function authenticateEmailPassword(
  email: string,
  password: string,
): Promise<WebAccount | null> {
  const account = findWebAccountByEmail(email);
  if (!account?.password_hash) return null;
  if (!verifyPassword(password, account.password_hash)) return null;
  return account;
}

export async function redeemBootstrapInstallCode(
  installCode: string,
  opts: { email: string; password: string; displayName?: string },
): Promise<{ account: WebAccount; cookieValue: string } | { error: string }> {
  const expected = resolveBootstrapInstallCode();
  if (!expected) {
    return { error: "bootstrap_not_configured" };
  }
  const email = opts.email.trim().toLowerCase();
  if (!email || !opts.password) {
    return { error: "missing_fields" };
  }
  try {
    assertPasswordPolicy(opts.password);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "password_too_short" };
  }
  const result = await redeemBootstrapAdminLocked(installCode, expected, {
    displayName: opts.displayName,
    email,
    password_hash: hashPassword(opts.password),
  });
  if ("error" in result) {
    return { error: result.error };
  }
  const { cookieValue } = await createWebSession(result);
  return { account: result, cookieValue };
}

export async function createEmailAccount(input: {
  email: string;
  password: string;
  display_name: string;
  role: WebRole;
}): Promise<WebAccount> {
  assertPasswordPolicy(input.password);
  if (findWebAccountByEmail(input.email)) {
    throw new Error("email_already_exists");
  }
  return upsertWebAccount({
    role: input.role,
    display_name: input.display_name,
    email: input.email,
    password_hash: hashPassword(input.password),
  });
}

export async function establishSessionForAccount(
  account: WebAccount,
): Promise<{ cookieValue: string }> {
  const { cookieValue } = await createWebSession(account);
  return { cookieValue };
}
