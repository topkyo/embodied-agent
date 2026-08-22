import { createLogger } from "@embodied-agent/platform";
import { buildDigestMessage, type DigestSlot } from "./builder.js";

import { getEffectiveSettings } from "../settings/store.js";
import { listDigestRecipients } from "../notifications/recipients.js";
import { defaultProactiveSend } from "../channels/proactive-send.js";
import { renderProactiveSummary } from "../nlg/render-reply.js";

const log = createLogger("digest");
/** 飞轮 dev：强制发一轮简报（不检查 wasDigestSent / 整点） */
export async function sendDigestSlotForced(slot: DigestSlot): Promise<void> {
  const settings = getEffectiveSettings();
  const template = buildDigestMessage(slot, settings.deployment_name, settings.deployment_id);
  const message = await renderProactiveSummary({
    kind: slot === "morning" ? "digest_morning" : "digest_evening",
    templateText: template,
    data: { deployment_id: settings.deployment_id },
  });
  const recipients = listDigestRecipients();
  for (const r of recipients) {
    await defaultProactiveSend(r.platform_user_id, message);
  }
  log.info("flywheel forced digest", { slot });
}
