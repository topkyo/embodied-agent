#!/usr/bin/env node
/**
 * OpenClaw hooks transform：将入站消息转发到具身Agent 集成端点。
 * 部署：复制到 ~/.openclaw/hooks/transforms/embodied-agent-forward.js
 * 环境变量：EMBODIED_AGENT_INTEGRATION_URL、INTEGRATION_SECRET
 */
export default async function transform(payload) {
  const base =
    process.env.EMBODIED_AGENT_INTEGRATION_URL ?? "http://127.0.0.1:3000/integrations/chat";
  const secret = process.env.INTEGRATION_SECRET;
  if (!secret) {
    throw new Error("INTEGRATION_SECRET is required");
  }

  const text = payload?.text?.trim?.() ?? payload?.message?.trim?.() ?? "";
  const userId = payload?.user_id ?? payload?.from ?? payload?.senderId ?? "unknown";
  const platform = payload?.platform ?? "wechat";
  const body = {
    platform,
    user_id: String(userId),
    conversation_id: payload?.conversation_id ?? String(userId),
  };
  if (text) body.text = text;
  if (payload?.audio_base64) {
    body.audio_base64 = payload.audio_base64;
    body.audio_format = payload?.audio_format ?? "wav";
  }

  const res = await fetch(base, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`integration POST ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return {
    ...payload,
    reply: data.reply ?? data.message ?? "",
    raw: data,
  };
}
