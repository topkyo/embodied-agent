import { createLogger } from "@embodied-agent/platform";
import {
  bindWechatPlatformUser,
  listBindings,
  resolvePlatformUser,
} from "../auth/platform-bind.js";
import { getEffectiveSettings } from "../settings/store.js";
import { listWechatAccounts } from "./ilink-store.js";

const log = createLogger("wechat-bind");

export function readDeploymentId(): string | null {
  try {
    const id = getEffectiveSettings().deployment_id?.trim();
    return id || null;
  } catch {
    return null;
  }
}

/**
 * 将微信 from_user_id 解析为现场 principal_user_id。
 * 优先 platform-bindings；缺失时从 wechat-ilink 账号记录修复（历史扫码未写入绑定的补偿）。
 */
export function resolveWechatPrincipal(platformUserId: string): string | null {
  const trimmed = platformUserId.trim();
  if (!trimmed) return null;

  const fromBinding = resolvePlatformUser("wechat", trimmed);
  if (fromBinding) return fromBinding.user_id;

  const account = listWechatAccounts().find((a) => a.linked_user_id === trimmed);
  const principal = account?.principal_user_id?.trim();
  if (!principal) return null;

  const deploymentId = readDeploymentId();
  if (!deploymentId) {
    log.warn("wechat account has principal but deployment_id missing; cannot repair binding", {
      platform_user_id: trimmed,
      principal_user_id: principal,
    });
    return null;
  }

  try {
    bindWechatPlatformUser(trimmed, principal, deploymentId);
    log.info("repaired platform binding from wechat account", {
      platform_user_id: trimmed,
      principal_user_id: principal,
    });
    return principal;
  } catch (e) {
    log.warn("failed to repair platform binding", {
      platform_user_id: trimmed,
      principal_user_id: principal,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export type MissingWechatBinding = {
  platform_user_id: string;
  principal_user_id: string;
  account_id: string;
};

/** 列出 wechat-ilink 账号中缺失 platform-bindings 的条目（供迁移脚本 dry-run）。 */
export function listMissingWechatBindings(): MissingWechatBinding[] {
  const existing = new Set(
    listBindings()
      .filter((b) => b.platform === "wechat")
      .map((b) => b.platform_user_id),
  );
  const out: MissingWechatBinding[] = [];
  for (const account of listWechatAccounts()) {
    const linked = account.linked_user_id?.trim();
    const principal = account.principal_user_id?.trim();
    if (!linked || !principal || existing.has(linked)) continue;
    out.push({
      platform_user_id: linked,
      principal_user_id: principal,
      account_id: account.account_id,
    });
  }
  return out;
}

/** 将 wechat-ilink 账号中缺失的 platform-bindings 补齐（供 notify/recipients 与 repair 路径复用）。 */
export function repairMissingWechatBindings(): number {
  const deploymentId = readDeploymentId();
  if (!deploymentId) return 0;

  const existing = new Set(
    listBindings()
      .filter((b) => b.platform === "wechat")
      .map((b) => b.platform_user_id),
  );
  let repaired = 0;
  for (const row of listMissingWechatBindings()) {
    if (existing.has(row.platform_user_id)) continue;
    try {
      bindWechatPlatformUser(row.platform_user_id, row.principal_user_id, deploymentId);
      existing.add(row.platform_user_id);
      repaired += 1;
      log.info("repaired platform binding from wechat account (batch)", {
        platform_user_id: row.platform_user_id,
        principal_user_id: row.principal_user_id,
      });
    } catch (e) {
      log.warn("failed to repair platform binding (batch)", {
        platform_user_id: row.platform_user_id,
        principal_user_id: row.principal_user_id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return repaired;
}
