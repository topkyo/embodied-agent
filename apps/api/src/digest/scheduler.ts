import { createLogger } from "@embodied-agent/platform";
import { hasActiveDigest } from "@embodied-agent/runtime";
import { buildDigestMessage, type DigestSlot } from "./builder.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";

import { markDigestSent, wasDigestSent } from "./state.js";
import { digestRecipientsForDeployment } from "../notifications/recipients.js";
import { defaultProactiveSend } from "../channels/proactive-send.js";
import { getEffectiveSettings } from "../settings/store.js";
import { loadPrimaryWechatAccount } from "../wechat/ilink-store.js";

const log = createLogger("digest");
let timer: ReturnType<typeof setInterval> | null = null;
let abort = false;

export function getZonedDateParts(
  timeZone: string,
  at = new Date(),
): { hour: number; minute: number; dateKey: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  return {
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

async function sendDigestSlot(slot: DigestSlot): Promise<void> {
  if (!hasActiveDigest(getPlatformRuntimeContext())) return;
  const settings = getEffectiveSettings();
  if (settings.digest_enabled === false) return;
  if (!loadPrimaryWechatAccount()?.token) return;

  const template = buildDigestMessage(slot, settings.deployment_name, settings.deployment_id);
  const { renderProactiveSummary } = await import("../nlg/render-reply.js");
  const message = await renderProactiveSummary({
    kind: slot === "morning" ? "digest_morning" : "digest_evening",
    templateText: template,
    data: { deployment_id: settings.deployment_id },
  });
  const recipients = digestRecipientsForDeployment(settings.deployment_id);
  let any = false;
  for (const r of recipients) {
    if (await defaultProactiveSend(r.platform_user_id, message)) {
      any = true;
    }
  }
  if (any) {
    log.info("sent digest", { slot, recipients: recipients.length });
  }
}

export async function tickDigestScheduler(at = new Date()): Promise<void> {
  if (!hasActiveDigest(getPlatformRuntimeContext())) return;
  const settings = getEffectiveSettings();
  if (settings.digest_enabled === false) return;

  const tz = settings.digest_timezone ?? "Asia/Shanghai";
  const { hour, minute, dateKey } = getZonedDateParts(tz, at);
  if (minute !== 0) return;

  const morningHour = settings.digest_morning_hour ?? 7;
  const eveningHour = settings.digest_evening_hour ?? 22;

  if (hour === morningHour) {
    const key = `morning:${dateKey}`;
    if (!wasDigestSent(key)) {
      await sendDigestSlot("morning");
      markDigestSent(key);
    }
  }
  if (hour === eveningHour) {
    const key = `evening:${dateKey}`;
    if (!wasDigestSent(key)) {
      await sendDigestSlot("evening");
      markDigestSent(key);
    }
  }
}

export function startDigestScheduler(): void {
  if (timer) return;
  if (!hasActiveDigest(getPlatformRuntimeContext())) return;
  abort = false;
  timer = setInterval(() => {
    if (abort) return;
    void tickDigestScheduler().catch((e) => {
      log.warn("scheduler error", { error: String(e) });
    });
  }, 60_000);
  log.info("scheduler started", { interval_seconds: 60 });
}

export function stopDigestScheduler(): void {
  abort = true;
  if (timer) clearInterval(timer);
  timer = null;
}
