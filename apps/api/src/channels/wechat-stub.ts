import { createLogger } from "@embodied-agent/platform";
import { isExplicitDevEnv } from "../runtime/env-mode.js";
import type { ChatChannel, InboundWebhookPayload } from "./interface.js";

import type { NormalizedChatMessage } from "../chat/types.js";

const log = createLogger("wechat-stub");
function pickString(body: InboundWebhookPayload, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = body[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

export const wechatStubChannel: ChatChannel = {
  id: "wechat-stub",

  verifySignature() {
    if (!isExplicitDevEnv()) {
      throw new Error("wechat-stub channel is dev-only and must not be used in production");
    }
    return true;
  },

  normalizeInbound(body: InboundWebhookPayload): NormalizedChatMessage {
    const user_id = pickString(body, "user_id", "FromUserName", "from_user");
    const conversation_id = pickString(body, "conversation_id", "ToUserName", "to_user");
    if (!user_id || !conversation_id) {
      throw new Error("需要 user_id/FromUserName 和 conversation_id/ToUserName。");
    }
    const text = pickString(body, "text", "Content", "content") ?? "";
    return {
      platform: "wechat-stub",
      conversation_id,
      user_id,
      text,
      timestamp: pickString(body, "timestamp", "CreateTime") ?? new Date().toISOString(),
    };
  },

  async sendReply(ctx: NormalizedChatMessage, reply: string): Promise<void> {
    const line = JSON.stringify({
      channel: "wechat-stub",
      to: ctx.user_id,
      conversation_id: ctx.conversation_id,
      reply,
    });
    log.info("stub reply", { payload: line });
  },

  async sendProactive(platformUserId: string, text: string): Promise<boolean> {
    if (!platformUserId.trim() || !text.trim()) return false;
    log.info("stub proactive", { to: platformUserId, len: text.length });
    return true;
  },
};
