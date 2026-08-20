import type { NormalizedChatMessage } from "@embodied-agent/chat-runtime";

export type InboundWebhookPayload = Record<string, unknown>;

export interface ChatChannel {
  readonly id: string;
  verifySignature(
    headers: Record<string, string | string[] | undefined>,
    body: InboundWebhookPayload,
  ): boolean;
  normalizeInbound(body: InboundWebhookPayload): NormalizedChatMessage;
  sendReply(ctx: NormalizedChatMessage, reply: string): Promise<void>;
  /** Optional proactive outbound (alerts/digest/report fallback). */
  sendProactive?(platformUserId: string, text: string): Promise<boolean>;
}

export type ChatChannelRegistry = Record<string, ChatChannel>;

export function createChatChannelRegistry(channels: readonly ChatChannel[]): ChatChannelRegistry {
  return Object.fromEntries(channels.map((channel) => [channel.id, channel]));
}

export function getRegisteredChatChannel(
  registry: ChatChannelRegistry,
  id: string,
): ChatChannel | undefined {
  return registry[id];
}

export function listRegisteredChatChannelIds(registry: ChatChannelRegistry): string[] {
  return Object.keys(registry);
}

export type { NormalizedChatMessage } from "@embodied-agent/chat-runtime";
