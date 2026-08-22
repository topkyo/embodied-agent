import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomInt } from "node:crypto";
import { createLogger, withFileLockSync } from "@embodied-agent/platform";
import { ensurePrincipalUser } from "./ensure-principal.js";
import { getUserStrict, type UserRecord } from "./users.js";
import { atomicWriteJson } from "@embodied-agent/platform";
import { dataRoot } from "../fs/deployment-path.js";

const log = createLogger("platform-bind");

export type PlatformBinding = {
  platform: string;
  platform_user_id: string;
  principal_user_id: string;
  bound_at: string;
  channel_welcome_sent_at?: string;
};

type BindingsFile = {
  bindings: PlatformBinding[];
};

type PairingCodeEntry = {
  code: string;
  principal_user_id: string;
  expires_at: string;
  domain?: string;
  deployment_id?: string;
};

type PairingFile = {
  codes: PairingCodeEntry[];
};

function bindingsPath(): string {
  return resolve(dataRoot(), "platform-bindings.json");
}

function pairingPath(): string {
  return resolve(dataRoot(), "pairing-codes.json");
}

function bindingsLockPath(): string {
  return `${bindingsPath()}.lock`;
}

function pairingLockPath(): string {
  return `${pairingPath()}.lock`;
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (e) {
    throw new Error(`${path} 无法读取或校验失败：${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteJson(path, data);
}

function bindingKey(platform: string, platformUserId: string): string {
  return `${platform}:${platformUserId}`;
}

export function listBindings(): PlatformBinding[] {
  const file = readJson<BindingsFile>(bindingsPath(), { bindings: [] });
  return file.bindings;
}

export function findPlatformBinding(
  platform: string,
  platformUserId: string,
): PlatformBinding | null {
  const key = bindingKey(platform, platformUserId);
  return listBindings().find((b) => bindingKey(b.platform, b.platform_user_id) === key) ?? null;
}

export function resolvePlatformUser(platform: string, platformUserId: string): UserRecord | null {
  const hit = findPlatformBinding(platform, platformUserId);
  if (!hit) return null;
  return getUserStrict(hit.principal_user_id) ?? null;
}

/** 微信扫码确认：自动建档 principal + 写入 platform-bindings（供语音/文字 IM 链路解析）。 */
export function bindWechatPlatformUser(
  platformUserId: string,
  principalUserId: string,
  deploymentId: string,
): PlatformBinding {
  ensurePrincipalUser(principalUserId, deploymentId);
  return upsertBinding("wechat", platformUserId, principalUserId);
}

export function removeBinding(platform: string, platformUserId: string): void {
  withFileLockSync(bindingsLockPath(), () => {
    const file = readJson<BindingsFile>(bindingsPath(), { bindings: [] });
    const key = bindingKey(platform, platformUserId);
    const next = file.bindings.filter((b) => bindingKey(b.platform, b.platform_user_id) !== key);
    writeJson(bindingsPath(), { bindings: next });
  });
}

export function upsertBinding(
  platform: string,
  platformUserId: string,
  principalUserId: string,
): PlatformBinding {
  if (!getUserStrict(principalUserId)) {
    throw new Error(`unknown principal_user_id: ${principalUserId}`);
  }
  return withFileLockSync(bindingsLockPath(), () => {
    const file = readJson<BindingsFile>(bindingsPath(), { bindings: [] });
    const key = bindingKey(platform, platformUserId);
    const existing = file.bindings.find((b) => bindingKey(b.platform, b.platform_user_id) === key);
    const next = file.bindings.filter((b) => bindingKey(b.platform, b.platform_user_id) !== key);
    const preserveWelcomeSentAt =
      existing &&
      existing.principal_user_id === principalUserId &&
      existing.channel_welcome_sent_at;
    const row: PlatformBinding = {
      platform,
      platform_user_id: platformUserId,
      principal_user_id: principalUserId,
      bound_at: new Date().toISOString(),
      ...(preserveWelcomeSentAt
        ? { channel_welcome_sent_at: existing.channel_welcome_sent_at }
        : {}),
    };
    next.push(row);
    writeJson(bindingsPath(), { bindings: next });
    return row;
  });
}

export function markWechatChannelWelcomeSent(platformUserId: string): void {
  try {
    withFileLockSync(bindingsLockPath(), () => {
      const file = readJson<BindingsFile>(bindingsPath(), { bindings: [] });
      const key = bindingKey("wechat", platformUserId);
      const idx = file.bindings.findIndex(
        (b) => bindingKey(b.platform, b.platform_user_id) === key,
      );
      if (idx < 0) {
        log.info("channel welcome mark skipped: binding not found", {
          platform: "wechat",
          platformUserId,
        });
        return;
      }
      const next = [...file.bindings];
      next[idx] = {
        ...next[idx]!,
        channel_welcome_sent_at: new Date().toISOString(),
      };
      writeJson(bindingsPath(), { bindings: next });
    });
  } catch (e) {
    log.error("channel welcome mark write failed", {
      platform: "wechat",
      platformUserId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export type IssuePairingCodeOptions = {
  ttlMinutes?: number;
  domain?: string;
  deployment_id?: string;
};

export function issuePairingCode(
  principalUserId: string,
  options: IssuePairingCodeOptions | number = 30,
): PairingCodeEntry {
  const ttlMinutes = typeof options === "number" ? options : (options.ttlMinutes ?? 30);
  const domainPack = typeof options === "number" ? undefined : options.domain?.trim() || undefined;
  const deploymentId =
    typeof options === "number" ? undefined : options.deployment_id?.trim() || undefined;
  if (!getUserStrict(principalUserId)) {
    throw new Error(`unknown principal_user_id: ${principalUserId}`);
  }
  return withFileLockSync(pairingLockPath(), () => {
    const file = readJson<PairingFile>(pairingPath(), { codes: [] });
    const now = Date.now();
    const active = file.codes.filter((c) => new Date(c.expires_at).getTime() > now);
    const code = String(randomInt(100000, 999999));
    const entry: PairingCodeEntry = {
      code,
      principal_user_id: principalUserId,
      expires_at: new Date(now + ttlMinutes * 60_000).toISOString(),
      ...(domainPack ? { domain: domainPack } : {}),
      ...(deploymentId ? { deployment_id: deploymentId } : {}),
    };
    active.push(entry);
    writeJson(pairingPath(), { codes: active });
    return entry;
  });
}

export function claimPairingCode(
  code: string,
  platform: string,
  platformUserId: string,
): PlatformBinding {
  const hit = withFileLockSync(pairingLockPath(), () => {
    const file = readJson<PairingFile>(pairingPath(), { codes: [] });
    const now = Date.now();
    const found = file.codes.find(
      (c) => c.code === code.trim() && new Date(c.expires_at).getTime() > now,
    );
    if (!found) {
      throw new Error("invalid_or_expired_code");
    }
    const remaining = file.codes.filter((c) => c.code !== found.code);
    writeJson(pairingPath(), { codes: remaining });
    return found;
  });
  return upsertBinding(platform, platformUserId, hit.principal_user_id);
}
