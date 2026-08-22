import type { IntentPayload } from "@embodied-agent/core";
import { createLogger } from "@embodied-agent/platform";
import { evaluateCommand, type UserRole } from "@embodied-agent/safety";
import { countAllPendingConfirms } from "../policy/pending-confirm.js";
import { loadRegistry, saveRegistry } from "@embodied-agent/node";
import { resolveDeviceRuntimeState } from "../devices/runtime-state.js";
import { getEffectiveSettings, saveSettings } from "../settings/store.js";
import type { MqttContext } from "@embodied-agent/node";
import { resolveConfiguredMqttUrl } from "../mqtt/url.js";
import { routeIntent } from "../skills/router.js";
import {
  activeDomainSafetyPolicy,
  executeDomainSkillHandler,
  resolveDeviceTarget,
} from "@embodied-agent/runtime";
import { listDomainDataRows } from "./domain-data-store.js";
import { requireAdmin } from "../routes/admin-auth.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";

const log = createLogger("admin-route-context");

function defaultUserRole(): UserRole {
  return "owner";
}

async function connectAdminMqtt(mqttCtx: MqttContext) {
  const url = resolveConfiguredMqttUrl();
  if (!url) {
    log.warn("mqtt_url 未配置，admin domain pack 路由跳过 MQTT 连接");
    return undefined;
  }
  const mqtt = mqttCtx.publisher.get(url);
  try {
    await mqtt.connect();
    return mqtt;
  } catch (error) {
    log.warn("admin mqtt connect failed", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

export function shouldRequireDomainIntentConfirmation(intent: IntentPayload): {
  required: boolean;
  reason: string;
  summary: string;
} {
  const resolved = resolveDeviceTarget(getPlatformRuntimeContext(), intent);
  if (resolved.ok === false) {
    return { required: false, reason: resolved.reason, summary: intent.skill };
  }
  const device = resolveDeviceRuntimeState(resolved.target);
  const safety = evaluateCommand({
    user_id: "admin",
    role: defaultUserRole(),
    skill: intent.skill,
    intent,
    device,
    confirm_duration_threshold_seconds: resolved.target.device.confirm_duration_threshold_seconds,
    domainSafetyPolicy: activeDomainSafetyPolicy(getPlatformRuntimeContext()),
  });
  return {
    required: safety.allowed && safety.requires_confirmation,
    reason: safety.reason,
    summary: intent.skill,
  };
}

export function domainPackAdminRouteContext(mqttCtx: MqttContext) {
  return {
    requireAdmin,
    getSettings: getEffectiveSettings,
    saveSettings,
    loadRegistry,
    saveRegistry,
    countPendingConfirms: countAllPendingConfirms,
    shouldRequireConfirmation: shouldRequireDomainIntentConfirmation,
    executeDomainSkillHandler: (intent: IntentPayload, context?: { userId?: string }) =>
      executeDomainSkillHandler(getPlatformRuntimeContext(), intent, context),
    async routeIntent(intent: IntentPayload, confirmed: boolean) {
      const mqtt = await connectAdminMqtt(mqttCtx);
      const routed = await routeIntent(intent, {
        user_id: "admin",
        role: defaultUserRole(),
        model: "admin-domain-pack",
        utterance: "admin domain pack intent",
        platform: "admin",
        conversation_id: "admin-domain-pack",
        skip_confirmation: confirmed,
        user_confirmed: confirmed,
        mqtt,
      });
      return { status: routed.status, body: routed };
    },
    listDomainDataRows,
  };
}

export type DomainPackAdminRouteContext = ReturnType<typeof domainPackAdminRouteContext>;
