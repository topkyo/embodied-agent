import { getIntentResolver } from "../runtime/agent-context.js";
import { extractInboundText, inboundHasVoice } from "../wechat/ilink-client.js";
import type { WeixinMessage } from "../wechat/ilink-client.js";

export async function resolveInboundUtterance(input: {
  text?: string;
  audio_base64?: string;
  audio_format?: string;
  wechatMessage?: WeixinMessage;
}): Promise<{ text: string; from_stt: boolean }> {
  const ilinkText = input.wechatMessage ? extractInboundText(input.wechatMessage) : "";
  const trimmed = (input.text?.trim() || ilinkText || "").trim();

  const resolver = getIntentResolver();
  if (input.audio_base64?.trim()) {
    return resolver.resolveUtteranceText({
      text: trimmed || undefined,
      audio_base64: input.audio_base64,
      audio_format: input.audio_format,
    });
  }

  if (trimmed) {
    return { text: trimmed, from_stt: false };
  }

  if (input.wechatMessage && inboundHasVoice(input.wechatMessage)) {
    return { text: "", from_stt: false };
  }

  return resolver.resolveUtteranceText({ text: trimmed });
}
