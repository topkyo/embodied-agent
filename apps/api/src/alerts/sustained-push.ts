import type { DomainPackSustainedAlertInput } from "@embodied-agent/core";
import { listAlertRules } from "./threshold-store.js";
import {
  evaluateThresholdBreach,
  isSustainedThresholdMet,
  shouldEvaluateSustainedL1,
  shouldEvaluateSustainedL2,
  thresholdAlertKey,
} from "@embodied-agent/alert-runtime";

import { appendAlertEvent } from "./alert-events.js";
import {
  confirmAlertFiredResilient,
  releaseAlertReservation,
  reserveAlertCooldown,
} from "./alert-state.js";
import {
  isSustainedAlertsEnabled,
  confirmSustainedL1Sent,
  getSustainedEpisode,
  releaseSustainedL1Reservation,
  reserveSustainedL1Send,
  markSustainedL2Sent,
  sustainedMinMinutes,
  tickSustainedEpisode,
} from "./sustained-state.js";
import type { AlertRule } from "./threshold-store.js";
import { getEffectiveSettings } from "../settings/store.js";
import { getTelemetry } from "../telemetry/store.js";
import { resolveAlertRecipients } from "../notifications/recipients.js";
import {
  proactiveWechatSendReady,
} from "../wechat/outbound.js";
import { defaultProactiveSend } from "../channels/proactive-send.js";
import { shouldSkipThresholdAlertForEntity } from "./node-offline.js";
import { setPendingConfirm } from "../policy/pending-confirm.js";
import { isL2SuppressedForUser } from "../policy/notification-prefs.js";
import type { AlertPushSend } from "./push.js";
import { renderProactiveSummary } from "../nlg/render-reply.js";
import { loadRegistry } from "@embodied-agent/node";
import { activeProactiveAlerts, hasActiveProactiveAlerts } from "@embodied-agent/runtime";
import { domainAlertMetricFormatter } from "./metric-formatter.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";

const DEFAULT_L2_COOLDOWN_SEC = 3600;

async function clearSustainedEpisodeWithRecovery(opts: {
  key: string;
  rule: AlertRule;
  deployment_id: string;
  now: number;
  value?: number;
}): Promise<void> {
  const prior = await getSustainedEpisode(opts.key, opts.deployment_id);
  await tickSustainedEpisode(opts.key, false, new Date(opts.now), opts.deployment_id);
  if (!prior?.l1_sent_at && !prior?.l2_sent_at) return;
  appendAlertEvent({
    deployment_id: opts.deployment_id,
    entity_id: opts.rule.entity_id,
    event_type: "recovery",
    metric: opts.rule.metric,
    ...(opts.value !== undefined ? { value: opts.value } : {}),
    message: `持续异常已解除：${opts.rule.entity_id} ${opts.rule.metric}`,
  });
}

export function l2CooldownSec(): number {
  const raw = process.env.SUSTAINED_L2_COOLDOWN_SECONDS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_L2_COOLDOWN_SEC;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_L2_COOLDOWN_SEC;
}

export async function evaluateSustainedAlerts(
  send: AlertPushSend = defaultProactiveSend,
  now = Date.now(),
): Promise<{ l1: number; l2: number }> {
  if (!isSustainedAlertsEnabled()) return { l1: 0, l2: 0 };
  if (!hasActiveProactiveAlerts(getPlatformRuntimeContext())) return { l1: 0, l2: 0 };

  const settings = getEffectiveSettings();
  if (settings.alert_push_enabled === false) return { l1: 0, l2: 0 };
  if (!proactiveWechatSendReady()) return { l1: 0, l2: 0 };

  const proactiveAlerts = activeProactiveAlerts(getPlatformRuntimeContext());
  const registry = loadRegistry();
  const minStreak = sustainedMinMinutes();
  let l1Count = 0;
  let l2Count = 0;

  const deployment_id = settings.deployment_id;
  for (const rule of listAlertRules(deployment_id)) {
      const key = thresholdAlertKey(deployment_id, rule);
      if (shouldSkipThresholdAlertForEntity(rule.entity_id, now, deployment_id)) {
        continue;
      }

      const telemetry = getTelemetry(rule.entity_id, deployment_id);
      const breach = evaluateThresholdBreach(rule, telemetry, domainAlertMetricFormatter);
      if (!breach?.breaching) {
        await clearSustainedEpisodeWithRecovery({
          key,
          rule,
          deployment_id,
          now,
          ...(breach ? { value: breach.value } : {}),
        });
        continue;
      }

      const { value, breaching } = breach;
      let episode = await tickSustainedEpisode(key, breaching, new Date(now), deployment_id);

      if (!isSustainedThresholdMet(episode, minStreak, breaching) && !episode.l1_sent_at) {
        continue;
      }

      const recipients = resolveAlertRecipients(rule);
      const alertInput: DomainPackSustainedAlertInput = {
        deploymentId: deployment_id,
        entityId: rule.entity_id,
        metric: rule.metric,
        operator: rule.operator,
        threshold: rule.value,
        current: value,
        streakMinutes: episode.streak_minutes,
        telemetry: { ...telemetry, entity_id: rule.entity_id },
        devices: registry.devices,
      };

      // L1：持续异常提醒（每 episode 一次，带冷却）
      if (shouldEvaluateSustainedL1(episode, minStreak, breaching)) {
        const l1CooldownKey = `sustained-l1:${key}`;
        if (!(await reserveAlertCooldown(l1CooldownKey, 1800, now, deployment_id))) {
          continue;
        }
        const reservedEpisode = await reserveSustainedL1Send(
          key,
          minStreak,
          breaching,
          new Date(now),
          deployment_id,
        );
        if (!reservedEpisode) {
          await releaseAlertReservation(l1CooldownKey, deployment_id);
          continue;
        }

        const message =
          reservedEpisode.streak_minutes === minStreak
            ? proactiveAlerts.sustainedL1Message(alertInput)
            : breach.message;

        let sent = false;
        for (const r of recipients) {
          if (await send(r.platform_user_id, message)) sent = true;
        }
        if (sent) {
          await confirmAlertFiredResilient(l1CooldownKey, new Date(now), deployment_id);
          episode = (await confirmSustainedL1Sent(key, new Date(now), deployment_id)) ?? episode;
          appendAlertEvent({
            deployment_id,
            entity_id: rule.entity_id,
            event_type: "sustained_threshold",
            metric: rule.metric,
            value,
            message,
          });
          l1Count++;
        } else {
          await releaseSustainedL1Reservation(key, deployment_id);
          await releaseAlertReservation(l1CooldownKey, deployment_id);
        }
      }

      const l2Plan = proactiveAlerts.sustainedL2Plan(alertInput);
      const l2CooldownKey = l2Plan ? `${l2Plan.cooldownKeyPrefix}:${key}` : "";
      if (
        l2Plan &&
        shouldEvaluateSustainedL2(episode, true) &&
        (await reserveAlertCooldown(l2CooldownKey, l2CooldownSec(), now, deployment_id))
      ) {
        const message = await renderProactiveSummary({
          kind: "sustained_l2",
          templateText: l2Plan.templateText,
          data: l2Plan.summaryData,
        });
        let sent = false;
        for (const r of recipients) {
          if (isL2SuppressedForUser(r.principal_user_id, now)) continue;
          if (await send(r.platform_user_id, message)) {
            setPendingConfirm({
              intent: l2Plan.confirmIntent,
              user_id: r.principal_user_id,
              conversation_id: r.platform_user_id,
              model: settings.llm_model,
              scene_skill_id: l2Plan.sceneSkillId,
            });
            sent = true;
          }
        }
        if (sent) {
          await confirmAlertFiredResilient(l2CooldownKey, new Date(now), deployment_id);
          await markSustainedL2Sent(key, new Date(now), deployment_id);
          appendAlertEvent({
            deployment_id,
            entity_id: rule.entity_id,
            event_type: "suggestion_l2",
            metric: rule.metric,
            value,
            message,
          });
          l2Count++;
        } else {
          await releaseAlertReservation(l2CooldownKey, deployment_id);
        }
      }
  }

  return { l1: l1Count, l2: l2Count };
}
