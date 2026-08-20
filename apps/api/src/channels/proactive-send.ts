import { createLogger } from "@embodied-agent/platform";
import { getChatChannel } from "./registry.js";
import { sendProactiveWechatText } from "../wechat/outbound.js";

const log = createLogger("channels.proactive");

export type ProactiveSendResult = {
  sent: boolean;
  channel?: string;
};

/**
 * Outbound proactive text with channel fallback.
 * Primary: WeChat iLink; secondary: active ChatChannel.sendProactive (if implemented).
 */
export async function sendProactiveText(
  platformUserId: string,
  text: string,
): Promise<ProactiveSendResult> {
  if (await sendProactiveWechatText(platformUserId, text)) {
    return { sent: true, channel: "wechat-ilink" };
  }

  const channel = getChatChannel();
  if (channel?.sendProactive) {
    const ok = await channel.sendProactive(platformUserId, text);
    if (ok) return { sent: true, channel: channel.id };
  }

  log.warn("proactive send exhausted", {
    to: platformUserId,
    len: text.length,
    channel: channel?.id ?? "none",
  });
  return { sent: false };
}

export type ProactiveSendFn = (platformUserId: string, text: string) => Promise<boolean>;

export async function defaultProactiveSend(platformUserId: string, text: string): Promise<boolean> {
  return (await sendProactiveText(platformUserId, text)).sent;
}
