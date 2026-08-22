import type { FastifyInstance } from "fastify";
import type { IntentPayload } from "@embodied-agent/core";
import { listAlertRules } from "../alerts/threshold-store.js";
import { getNodeRuntimeStatus } from "../nodes/online-status.js";
import { getEffectiveSettings } from "../settings/store.js";
import { DISPLAY_DEFAULTS } from "../settings/defaults.js";
import { isSttConfigured } from "../settings/stt-provider.js";
import type { MqttPublisherHolder } from "@embodied-agent/node";
import {
  countAllPendingConfirms,
  listAllPendingConfirms,
  type PendingConfirm,
} from "../policy/pending-confirm.js";
import { loadRegistry } from "@embodied-agent/node";
import { listNodes } from "@embodied-agent/node";
import { getIngestedTelemetry } from "../telemetry/store.js";
import { requireOperator } from "./admin-auth.js";

const MISSING_SUMMARY = "—";

const TARGET_SUMMARY_KEYS = [
  "entity_id",
  "device_id",
  "greenhouse_id",
  "robot_id",
  "node_id",
  "zone_id",
  "plot_id",
] as const;

export type PendingConfirmView = {
  user_id: string;
  created_at: number;
  expires_at: number;
  scene_skill_id?: string;
  action_summary: string;
  target_summary: string;
};

function intentActionSummary(intent: IntentPayload | undefined): string {
  if (!intent || typeof intent !== "object") return MISSING_SUMMARY;
  if (typeof intent.skill === "string" && intent.skill.trim()) return intent.skill.trim();
  const action = (intent as Record<string, unknown>).action;
  if (typeof action === "string" && action.trim()) return action.trim();
  return MISSING_SUMMARY;
}

function intentTargetSummary(intent: IntentPayload | undefined): string {
  if (!intent || typeof intent !== "object") return MISSING_SUMMARY;
  const target = intent.target;
  if (!target || typeof target !== "object" || Array.isArray(target)) return MISSING_SUMMARY;
  for (const key of TARGET_SUMMARY_KEYS) {
    const val = target[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  const parts = Object.entries(target)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`);
  return parts.length > 0 ? parts.join(", ") : MISSING_SUMMARY;
}

export function toPendingConfirmView(row: PendingConfirm): PendingConfirmView {
  return {
    user_id: row.user_id,
    created_at: row.created_at,
    expires_at: row.expires_at,
    ...(row.scene_skill_id ? { scene_skill_id: row.scene_skill_id } : {}),
    action_summary: intentActionSummary(row.intent),
    target_summary: intentTargetSummary(row.intent),
  };
}

export type AdminOverviewEntity = {
  entity_id: string;
  entity_type: string;
  domain_id?: string;
  name?: string;
  telemetry?: Record<string, unknown>;
  reported_at?: string;
  stale: boolean;
};

export type AdminOverviewNode = {
  node_id: string;
  deployment_id?: string;
  entity_id?: string;
  status: string;
  online: boolean;
  reported_at: string | null;
};

export type AdminOverviewServices = {
  api: string;
  deployment_id: string;
  deployment_name: string;
  llm_configured: boolean;
  llm_provider: string;
  llm_model: string;
  stt_model: string;
  stt_provider: string;
  stt_enabled: boolean;
  mqtt_url: string;
  mqtt_publisher: ReturnType<MqttPublisherHolder["status"]>;
  chat_channel: string;
  alert_push_enabled: boolean;
  digest_enabled: boolean;
  digest_morning_hour: number;
  digest_evening_hour: number;
  digest_timezone: string;
};

export type AdminOverview = {
  deployment_id: string;
  deployment_name: string;
  entities: AdminOverviewEntity[];
  nodes: AdminOverviewNode[];
  services: AdminOverviewServices;
  pending_confirms_count: number;
  pending_confirms: PendingConfirmView[];
  active_alert_rules_count: number;
};

const DEFAULT_TELEMETRY_STALE_MS = 90_000;

/** 遥测陈旧阈值；默认 90s，可用 `TELEMETRY_STALE_MS` 覆盖（与节点心跳超时解耦）。 */
export function telemetryStaleMs(): number {
  const ms = Number.parseInt(
    process.env.TELEMETRY_STALE_MS ?? String(DEFAULT_TELEMETRY_STALE_MS),
    10,
  );
  return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_TELEMETRY_STALE_MS;
}

function isTelemetryStale(reported_at: string | undefined, now: number): boolean {
  if (!reported_at) return true;
  const ts = Date.parse(reported_at);
  if (!Number.isFinite(ts)) return true;
  return now - ts > telemetryStaleMs();
}

function entityTelemetry(
  tel: ReturnType<typeof getIngestedTelemetry>[number] | undefined,
): Record<string, unknown> | undefined {
  if (!tel) return undefined;
  const { reported_at: _reportedAt, ...telemetry } = tel;
  return telemetry;
}

export function buildAdminOverview(
  mqttCtx: { publisher: MqttPublisherHolder },
  now = Date.now(),
): AdminOverview {
  const settings = getEffectiveSettings();
  const deployment_id = settings.deployment_id;
  const registry = loadRegistry();
  const telemetryByEntity = new Map(
    getIngestedTelemetry(deployment_id).map((t) => [t.entity_id, t]),
  );

  const entities: AdminOverviewEntity[] = (registry.entities ?? [])
    .filter(
      (entity) =>
        entity.deployment_id === deployment_id && entity.domain_id === settings.active_domain,
    )
    .map((entity) => {
      const tel = telemetryByEntity.get(entity.entity_id);
      const stale = isTelemetryStale(tel?.reported_at, now);
      return {
        entity_id: entity.entity_id,
        entity_type: entity.entity_type,
        domain_id: entity.domain_id,
        name: entity.name,
        telemetry: entityTelemetry(tel),
        reported_at: tel?.reported_at,
        stale,
      };
    });

  const nodes: AdminOverviewNode[] = listNodes(deployment_id).map((n) => {
    const runtime = getNodeRuntimeStatus(n.node_id, now, n.deployment_id);
    return {
      node_id: n.node_id,
      deployment_id: n.deployment_id,
      entity_id: n.entity_id,
      status: n.status,
      online: runtime.online,
      reported_at: runtime.reported_at,
    };
  });

  const services: AdminOverviewServices = {
    api: "ok",
    deployment_id: settings.deployment_id,
    deployment_name: settings.deployment_name,
    llm_configured: Boolean(settings.llm_api_key),
    llm_provider: settings.llm_provider,
    llm_model: settings.llm_model,
    stt_model: settings.stt_model,
    stt_provider: settings.stt_provider,
    stt_enabled: isSttConfigured(settings),
    mqtt_url: settings.mqtt_url,
    mqtt_publisher: mqttCtx.publisher.status(),
    chat_channel: process.env.CHAT_CHANNEL ?? DISPLAY_DEFAULTS.chat_channel,
    alert_push_enabled: settings.alert_push_enabled !== false,
    digest_enabled: settings.digest_enabled !== false,
    digest_morning_hour: settings.digest_morning_hour ?? DISPLAY_DEFAULTS.digest_morning_hour,
    digest_evening_hour: settings.digest_evening_hour ?? DISPLAY_DEFAULTS.digest_evening_hour,
    digest_timezone: settings.digest_timezone ?? DISPLAY_DEFAULTS.digest_timezone,
  };

  return {
    deployment_id,
    deployment_name: settings.deployment_name,
    entities,
    nodes,
    services,
    pending_confirms_count: countAllPendingConfirms(),
    pending_confirms: listAllPendingConfirms().map(toPendingConfirmView),
    active_alert_rules_count: listAlertRules(deployment_id).length,
  };
}

export async function registerAdminOverviewRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/overview", async (request, reply) => {
    if (!requireOperator(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return buildAdminOverview(app.mqtt);
  });
}
