import { createLogger } from "@embodied-agent/platform";
import { findPlatformBinding, markWechatChannelWelcomeSent } from "../auth/platform-bind.js";
import {
  formatChannelOnboardingTip,
  isChannelHelpKeyword,
  resolveActiveChannelOnboardingExamples,
  shouldAppendChannelWelcomeTip,
} from "../chat/channel-onboarding.js";
import { processChatMessage, resolveLlmFromSettings } from "../chat/pipeline.js";
import { resolveWechatPrincipal } from "./resolve-wechat-principal.js";
import { USER_REPLY } from "../chat/user-messages.js";
import type { NormalizedChatMessage } from "../chat/types.js";
import { isSttConfigured } from "../settings/stt-provider.js";
import { getEffectiveSettings } from "../settings/store.js";
import { resolveInboundUtterance } from "../chat/resolve-utterance.js";
import type { MqttContext } from "@embodied-agent/node";
import { getUpdates, inboundHasVoice, sendTextMessage } from "./ilink-client.js";
import {
  loadPrimaryWechatAccount,
  loadSyncBuf,
  saveSyncBuf,
  type WechatIlinkAccount,
} from "./ilink-store.js";
import { rememberWechatContext } from "./outbound.js";
import { isInboundDuplicate, markInboundProcessed } from "./inbound-dedup.js";
const log = createLogger("wechat-bridge");

let running = false;
let abort = false;
let lastPollAt: string | null = null;
let lastPollError: string | null = null;
let bridgeMqttCtx: MqttContext | null = null;

function resolvePrincipalUserId(platformUserId: string): string | null {
  return resolveWechatPrincipal(platformUserId);
}

async function handleInbound(
  account: WechatIlinkAccount,
  fromUserId: string,
  text: string,
  contextToken: string,
): Promise<void> {
  rememberWechatContext(account.account_id, fromUserId, contextToken);

  const principalUserId = resolvePrincipalUserId(fromUserId);
  let reply: string;
  let appendWelcomeTip = false;
  if (!text) {
    reply = isSttConfigured(getEffectiveSettings()) ? USER_REPLY.sttFailed : USER_REPLY.needContent;
  } else if (!principalUserId) {
    reply = USER_REPLY.notBound;
  } else {
    const binding = findPlatformBinding("wechat", fromUserId);
    const isHelp = isChannelHelpKeyword(text);
    appendWelcomeTip = shouldAppendChannelWelcomeTip(isHelp, binding?.channel_welcome_sent_at);

    if (isHelp) {
      reply = formatChannelOnboardingTip(resolveActiveChannelOnboardingExamples());
    } else {
      const msg: NormalizedChatMessage = {
        platform: "wechat",
        user_id: principalUserId,
        conversation_id: fromUserId,
        text,
        timestamp: new Date().toISOString(),
      };
      try {
        const result = await processChatMessage(msg, resolveLlmFromSettings(), bridgeMqttCtx!);
        reply = result.reply;
      } catch {
        reply = USER_REPLY.llmUnavailable;
      }
    }
  }

  try {
    await sendTextMessage({
      baseUrl: account.base_url,
      token: account.token,
      toUserId: fromUserId,
      text: reply,
      contextToken,
    });
    log.info("sent reply", {
      to: fromUserId,
      chars: reply.length,
      preview: reply.slice(0, 40),
    });
  } catch (e) {
    log.error("send failed", {
      to: fromUserId,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }

  if (appendWelcomeTip) {
    const tip = formatChannelOnboardingTip(resolveActiveChannelOnboardingExamples());
    try {
      await sendTextMessage({
        baseUrl: account.base_url,
        token: account.token,
        toUserId: fromUserId,
        text: tip,
        contextToken,
      });
      log.info("sent channel onboarding tip", {
        to: fromUserId,
        chars: tip.length,
      });
      markWechatChannelWelcomeSent(fromUserId);
    } catch (e) {
      log.error("channel onboarding tip send failed", {
        to: fromUserId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

/** @internal Vitest：驱动 inbound onboarding 行为 */
export async function handleWechatInboundForTest(
  account: WechatIlinkAccount,
  fromUserId: string,
  text: string,
  contextToken: string,
): Promise<void> {
  return handleInbound(account, fromUserId, text, contextToken);
}

/** @internal Vitest：processChatMessage 需要 bridge mqtt 上下文 */
export function setWechatBridgeMqttContextForTest(ctx: MqttContext): void {
  bridgeMqttCtx = ctx;
}

async function pollLoop(account: WechatIlinkAccount): Promise<void> {
  let buf = loadSyncBuf(account.account_id);
  while (!abort) {
    try {
      const resp = await getUpdates({
        baseUrl: account.base_url,
        token: account.token,
        get_updates_buf: buf,
      });
      if (resp.get_updates_buf) {
        buf = resp.get_updates_buf;
        saveSyncBuf(account.account_id, buf);
      }
      lastPollAt = new Date().toISOString();
      lastPollError = null;
      for (const msg of resp.msgs ?? []) {
        if (msg.message_type !== 1) continue;
        const from = msg.from_user_id?.trim();
        const token = msg.context_token?.trim();
        if (!from || !token) continue;
        const isVoice = inboundHasVoice(msg);
        let text = "";
        try {
          const resolved = await resolveInboundUtterance({
            wechatMessage: msg,
          });
          text = resolved.text;
        } catch {
          text = "";
        }
        // 语音分片：未完成且无转写时跳过，避免先发「没听清」
        if (isVoice && !text && msg.message_state !== 2) {
          log.info("voice partial, waiting", {
            from,
            state: msg.message_state ?? "unknown",
          });
          continue;
        }
        if (isInboundDuplicate(account.account_id, from, token)) {
          log.info("dedup skip", { from });
          continue;
        }
        if (isVoice) {
          log.info("voice inbound", {
            from,
            has_transcript: Boolean(text),
            text: text.slice(0, 60),
          });
        } else if (text) {
          log.info("text inbound", { from, text: text.slice(0, 60) });
        }
        try {
          await handleInbound(account, from, text, token);
          markInboundProcessed(account.account_id, from, token);
        } catch (e) {
          log.error("handleInbound error", { error: String(e) });
        }
      }
    } catch (e) {
      lastPollError = e instanceof Error ? e.message : String(e);
      log.warn("poll error", { error: String(e) });
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
}

export function isWechatBridgeRunning(): boolean {
  return running;
}

export function getWechatBridgeDiagnostics(): {
  last_poll_at: string | null;
  last_error: string | null;
} {
  return { last_poll_at: lastPollAt, last_error: lastPollError };
}

export function restartWechatBridge(): void {
  stopWechatBridge();
  if (bridgeMqttCtx) startWechatBridgeIfConfigured(bridgeMqttCtx);
}

export function stopWechatBridge(): void {
  abort = true;
  running = false;
}

export function startWechatBridgeIfConfigured(mqttCtx: MqttContext): void {
  // 先记住 mqttCtx：bootstrap 时若尚无微信账号（首次部署未扫码），
  // 之后扫码成功的 restartWechatBridge() 仍能凭它把桥接拉起来
  bridgeMqttCtx = mqttCtx;
  if (running) return;
  const account = loadPrimaryWechatAccount();
  if (!account?.token) return;
  abort = false;
  running = true;
  log.info("started", { account_id: account.account_id });
  void pollLoop(account).finally(() => {
    running = false;
    log.info("stopped");
  });
}
