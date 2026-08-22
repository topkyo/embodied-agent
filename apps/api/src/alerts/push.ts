import { evaluateThresholdBreach, thresholdAlertKey } from "@embodied-agent/alert-runtime";
import { hasActiveProactiveAlerts } from "@embodied-agent/runtime";
import { listAlertRules } from "./threshold-store.js";
import { appendAlertEvent } from "./alert-events.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";
import {
  confirmAlertFiredResilient,
  releaseAlertReservation,
  reserveAlertCooldown,
} from "./alert-state.js";
import { getEffectiveSettings } from "../settings/store.js";
import { getTelemetry } from "../telemetry/store.js";
import { resolveAlertRecipients } from "../notifications/recipients.js";
import { defaultProactiveSend } from "../channels/proactive-send.js";
import { loadPrimaryWechatAccount } from "../wechat/ilink-store.js";
import { shouldSkipThresholdAlertForEntity } from "./node-offline.js";
import { isSustainedAlertsEnabled } from "./sustained-state.js";
import { domainAlertMetricFormatter } from "./metric-formatter.js";

export type AlertPushSend = (platformUserId: string, text: string) => Promise<boolean>;

const DEFAULT_COOLDOWN_SEC = Number(process.env.ALERT_COOLDOWN_SECONDS ?? "1800");

export async function evaluateAndPushAlerts(
  send: AlertPushSend = defaultProactiveSend,
  now = Date.now(),
): Promise<number> {
  const settings = getEffectiveSettings();
  if (settings.alert_push_enabled === false) return 0;
  if (!loadPrimaryWechatAccount()?.token) return 0;

  if (isSustainedAlertsEnabled() && hasActiveProactiveAlerts(getPlatformRuntimeContext())) return 0;

  let fired = 0;
  const deployment_id = settings.deployment_id;
  for (const rule of listAlertRules(deployment_id)) {
    if (shouldSkipThresholdAlertForEntity(rule.entity_id, now, deployment_id)) {
      continue;
    }
    const telemetry = getTelemetry(rule.entity_id, deployment_id);
    const evaluation = evaluateThresholdBreach(rule, telemetry, domainAlertMetricFormatter);
    if (!evaluation?.breaching) continue;

    const key = thresholdAlertKey(deployment_id, rule);
    if (!(await reserveAlertCooldown(key, DEFAULT_COOLDOWN_SEC, now, deployment_id))) continue;

    const recipients = resolveAlertRecipients(rule);
    let sent = false;
    for (const r of recipients) {
      if (await send(r.platform_user_id, evaluation.message)) sent = true;
    }
    if (sent) {
      await confirmAlertFiredResilient(key, new Date(now), deployment_id);
      appendAlertEvent({
        deployment_id,
        entity_id: rule.entity_id,
        event_type: "threshold",
        metric: rule.metric,
        value: evaluation.value,
        message: evaluation.message,
      });
      fired++;
    } else {
      await releaseAlertReservation(key, deployment_id);
    }
  }

  return fired;
}
