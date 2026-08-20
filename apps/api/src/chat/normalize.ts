import type { NormalizedChatMessage } from "./types.js";

export function normalizeDevChat(body: {
  text: string;
  user_id: string;
  conversation_id: string;
}): NormalizedChatMessage {
  return {
    platform: "dev",
    conversation_id: body.conversation_id.trim(),
    user_id: body.user_id.trim(),
    text: body.text.trim(),
    timestamp: new Date().toISOString(),
  };
}
