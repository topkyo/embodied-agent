import { createLogger } from "@embodied-agent/platform";
import { sendTextMessage } from "./ilink-client.js";

import { getWechatContextToken, setWechatContextToken } from "./context-store.js";
import { loadPrimaryWechatAccount, type WechatIlinkAccount } from "./ilink-store.js";

const log = createLogger("wechat-outbound");
export function isFlywheelDevBypass(): boolean {
  return process.env.FLYWHEEL_DEV === "1" && process.env.NODE_ENV !== "production";
}

export function proactiveWechatSendReady(
  account: WechatIlinkAccount | null = loadPrimaryWechatAccount(),
): boolean {
  if (isFlywheelDevBypass()) return true;
  return Boolean(account?.token?.trim());
}

export async function sendProactiveWechatText(
  platformUserId: string,
  text: string,
  account = loadPrimaryWechatAccount(),
): Promise<boolean> {
  if (isFlywheelDevBypass()) {
    log.info("flywheel-dev skip send", { to: platformUserId, len: text.length });
    return true;
  }
  if (!account?.token?.trim() || !platformUserId.trim() || !text.trim()) {
    return false;
  }
  const contextToken = getWechatContextToken(account.account_id, platformUserId);
  if (!contextToken) {
    log.warn("skip send: no context_token", { to: platformUserId });
    return false;
  }
  try {
    await sendTextMessage({
      baseUrl: account.base_url,
      token: account.token,
      toUserId: platformUserId,
      text,
      contextToken,
    });
    return true;
  } catch (e) {
    log.error("send failed", {
      to: platformUserId,
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

export function rememberWechatContext(
  accountId: string,
  platformUserId: string,
  contextToken: string,
): void {
  setWechatContextToken(accountId, platformUserId, contextToken);
}
