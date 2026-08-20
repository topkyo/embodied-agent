import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createLogger,
  isEncryptedSecret,
  maybeDecryptSecret,
  maybeEncryptSecret,
} from "@embodied-agent/platform";
import { atomicWriteJson } from "@embodied-agent/platform";
import { dataRoot } from "../fs/deployment-path.js";
import { isExplicitDevEnv } from "../runtime/env-mode.js";

const log = createLogger("wechat-ilink-store");

export type WechatIlinkAccount = {
  account_id: string;
  token: string;
  base_url: string;
  linked_user_id?: string;
  principal_user_id?: string;
  saved_at: string;
};

function accountsDir(): string {
  return resolve(dataRoot(), "wechat-ilink");
}

function accountPath(accountId: string): string {
  const safe = accountId.replace(/[@/\\:]/g, "_");
  return resolve(accountsDir(), `${safe}.json`);
}

function syncBufPath(accountId: string): string {
  const safe = accountId.replace(/[@/\\:]/g, "_");
  return resolve(accountsDir(), `${safe}.sync.json`);
}

function assertWechatTokenWritable(token: string): void {
  if (isExplicitDevEnv()) return;
  if (!token.trim()) return;
  if (isEncryptedSecret(token)) return;
  if (process.env.AGENT_SECRETS_KEY?.trim()) return;
  throw new Error("生产环境禁止在 wechat-ilink 明文存储 bot_token；请设置 AGENT_SECRETS_KEY。");
}

function encryptTokenForPersist(token: string): string {
  return maybeEncryptSecret(token) ?? token;
}

function decryptTokenFromPersist(token: string): string {
  return maybeDecryptSecret(token) ?? token;
}

function parseAccount(raw: WechatIlinkAccount): WechatIlinkAccount {
  return {
    ...raw,
    token: decryptTokenFromPersist(raw.token),
  };
}

function persistAccount(account: WechatIlinkAccount): void {
  assertWechatTokenWritable(account.token);
  const persisted: WechatIlinkAccount = {
    ...account,
    token: encryptTokenForPersist(account.token),
  };
  atomicWriteJson(accountPath(account.account_id), persisted);
}

export function saveWechatAccount(account: WechatIlinkAccount): void {
  mkdirSync(accountsDir(), { recursive: true });
  persistAccount(account);
}

export function loadWechatAccount(accountId: string): WechatIlinkAccount | null {
  const path = accountPath(accountId);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as WechatIlinkAccount;
    if (typeof raw.token === "string" && raw.token.trim() && !isEncryptedSecret(raw.token)) {
      log.warn("wechat token 明文落盘，正在加密写回", { account_id: accountId });
      persistAccount(raw);
    }
    return parseAccount(raw);
  } catch (error) {
    log.warn("wechat 账号文件损坏，已跳过", { path, error: String(error) });
    return null;
  }
}

export function listWechatAccounts(): WechatIlinkAccount[] {
  mkdirSync(accountsDir(), { recursive: true });
  const files = readdirSync(accountsDir()).filter(
    (f) => f.endsWith(".json") && !f.endsWith(".sync.json"),
  );
  const out: WechatIlinkAccount[] = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(
        readFileSync(resolve(accountsDir(), file), "utf8"),
      ) as WechatIlinkAccount;
      if (raw.account_id && raw.token) out.push(parseAccount(raw));
    } catch (error) {
      const path = resolve(accountsDir(), file);
      log.warn("wechat 账号文件损坏，已跳过", { path, error: String(error) });
    }
  }
  return out;
}

export function loadPrimaryWechatAccount(): WechatIlinkAccount | null {
  const all = listWechatAccounts();
  if (all.length === 0) return null;
  return all.sort((a, b) => b.saved_at.localeCompare(a.saved_at))[0]!;
}

export function loadSyncBuf(accountId: string): string {
  const path = syncBufPath(accountId);
  if (!existsSync(path)) return "";
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { buf?: string };
    return parsed.buf ?? "";
  } catch (error) {
    log.warn("wechat 账号文件损坏，已跳过", { path, error: String(error) });
    return "";
  }
}

export function saveSyncBuf(accountId: string, buf: string): void {
  mkdirSync(dirname(syncBufPath(accountId)), { recursive: true });
  atomicWriteJson(syncBufPath(accountId), { buf });
}
