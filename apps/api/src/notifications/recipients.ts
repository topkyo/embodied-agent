import type { UserRole } from "@embodied-agent/safety";
import { listBindings } from "../auth/platform-bind.js";
import { getUserStrict } from "../auth/users.js";
import type { AlertRule } from "../alerts/threshold-store.js";
import { repairMissingWechatBindings } from "../wechat/resolve-wechat-principal.js";

export type WechatRecipient = {
  platform_user_id: string;
  principal_user_id: string;
};

export function listWechatRecipientsByRoles(roles: UserRole[]): WechatRecipient[] {
  repairMissingWechatBindings();
  const roleSet = new Set(roles);
  const out: WechatRecipient[] = [];
  const seen = new Set<string>();
  for (const b of listBindings()) {
    if (b.platform !== "wechat") continue;
    const user = getUserStrict(b.principal_user_id);
    if (!user || !roleSet.has(user.role)) continue;
    if (seen.has(b.platform_user_id)) continue;
    seen.add(b.platform_user_id);
    out.push({
      platform_user_id: b.platform_user_id,
      principal_user_id: b.principal_user_id,
    });
  }
  return out;
}

export function resolveAlertRecipients(rule: AlertRule): WechatRecipient[] {
  repairMissingWechatBindings();
  const byId = new Map<string, WechatRecipient>();
  for (const b of listBindings()) {
    if (b.platform !== "wechat") continue;
    if (b.principal_user_id !== rule.updated_by) continue;
    byId.set(b.platform_user_id, {
      platform_user_id: b.platform_user_id,
      principal_user_id: b.principal_user_id,
    });
  }
  for (const r of listWechatRecipientsByRoles(["owner", "operator"])) {
    byId.set(r.platform_user_id, r);
  }
  return [...byId.values()];
}

export function listDigestRecipients(): WechatRecipient[] {
  return listWechatRecipientsByRoles(["owner"]);
}

export function digestRecipientsForDeployment(deployment_id: string): WechatRecipient[] {
  return listDigestRecipients().filter((r) => {
    const user = getUserStrict(r.principal_user_id);
    return user?.deployment_id === deployment_id;
  });
}
