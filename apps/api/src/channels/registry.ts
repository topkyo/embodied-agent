import {
  createChatChannelRegistry,
  getRegisteredChatChannel,
  listRegisteredChatChannelIds,
  type ChatChannel,
} from "@embodied-agent/channel-runtime";
import { wechatStubChannel } from "./wechat-stub.js";

const CHANNEL_REGISTRY = createChatChannelRegistry([wechatStubChannel]);

export type ChatChannelId = "dev" | "wechat-stub";

export function resolveChatChannelId(): ChatChannelId {
  const raw = process.env.CHAT_CHANNEL ?? "dev";
  if (raw === "wechat-stub") return "wechat-stub";
  return "dev";
}

export function getChatChannel(id?: string): ChatChannel | undefined {
  const channelId = id ?? resolveChatChannelId();
  if (channelId === "dev") return undefined;
  return getRegisteredChatChannel(CHANNEL_REGISTRY, channelId);
}

export function listRegisteredChannels(): string[] {
  return listRegisteredChatChannelIds(CHANNEL_REGISTRY);
}
