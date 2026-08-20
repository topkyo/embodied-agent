import type { FastifyInstance } from "fastify";
import { getEffectiveSettings, toPublicSettings, unlockGeoCoordinates } from "../../settings/store.js";
import { DISPLAY_DEFAULTS } from "../../settings/defaults.js";
import {
  refreshNetworkCoordinates,
  type GeoCoordinates,
} from "../../integrations/weather/geo-locate.js";
import { isSttConfigured } from "../../settings/stt-provider.js";
import { requireAdmin } from "../admin-auth.js";
import { loadRegistry } from "@embodied-agent/node";
import { listNdviCacheEntries, listNdviPlots } from "../../integrations/satellite/ndvi.js";
import {
  refreshAllNdviPlots,
  requireActiveSatelliteCapability,
} from "../../integrations/satellite/scheduler.js";

export function registerSettingsMiscRoutes(app: FastifyInstance): void {
  app.post<{
    Body?: { force?: boolean; unlock?: boolean };
  }>("/admin/geo/locate", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const body = request.body ?? {};
    if (body.unlock) unlockGeoCoordinates();
    try {
      const coords: GeoCoordinates = await refreshNetworkCoordinates({
        force: body.force !== false,
      });
      const note =
        coords.source === "manual"
          ? "已手动锁定坐标，节点 GPS / IP 定位不会覆盖。如需自动定位请先解锁。"
          : coords.source === "ip"
            ? "已从网络更新农场坐标（IP 定位，24 小时内缓存）。"
            : undefined;
      return {
        ok: true,
        coordinates: coords,
        settings: toPublicSettings(getEffectiveSettings()),
        note,
      };
    } catch (e) {
      return reply.status(502).send({
        error: e instanceof Error ? e.message : "geo_locate_failed",
      });
    }
  });

  app.get("/admin/deployments", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const active = getEffectiveSettings().deployment_id;
    try {
      const reg = loadRegistry();
      const registryDeployments = reg.deployments.map((d) => ({
        deployment_id: d.deployment_id,
        name: d.name,
      }));
      return {
        active_deployment_id: active,
        deployments: registryDeployments,
        data_dirs: [{ deployment_id: active, scoped: true }],
      };
    } catch (e) {
      return reply.status(500).send({
        error: "registry_unavailable",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });

  app.get("/admin/satellite/ndvi", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    try {
      requireActiveSatelliteCapability();
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : "satellite_capability_unavailable",
      });
    }
    return {
      plots: listNdviPlots(),
      cache: listNdviCacheEntries(),
      api_key_set: Boolean(getEffectiveSettings().satellite_api_key),
    };
  });

  app.post("/admin/satellite/refresh", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    try {
      requireActiveSatelliteCapability();
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : "satellite_capability_unavailable",
      });
    }
    try {
      const refreshed = await refreshAllNdviPlots();
      return {
        ok: true,
        refreshed: refreshed.length,
        cache: listNdviCacheEntries(),
      };
    } catch (e) {
      return reply.status(502).send({
        error: e instanceof Error ? e.message : "ndvi_refresh_failed",
      });
    }
  });

  app.get("/admin/status", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const s = getEffectiveSettings();
    return {
      api: "ok",
      deployment_id: s.deployment_id,
      deployment_name: s.deployment_name,
      llm_configured: Boolean(s.llm_api_key),
      llm_provider: s.llm_provider,
      llm_model: s.llm_model,
      stt_model: s.stt_model,
      stt_provider: s.stt_provider,
      stt_enabled: isSttConfigured(s),
      mqtt_url: s.mqtt_url,
      mqtt_publisher: app.mqtt.publisher.status(),
      chat_channel: process.env.CHAT_CHANNEL ?? DISPLAY_DEFAULTS.chat_channel,
      alert_push_enabled: s.alert_push_enabled !== false,
      digest_enabled: s.digest_enabled !== false,
      digest_morning_hour: s.digest_morning_hour ?? DISPLAY_DEFAULTS.digest_morning_hour,
      digest_evening_hour: s.digest_evening_hour ?? DISPLAY_DEFAULTS.digest_evening_hour,
      digest_timezone: s.digest_timezone ?? DISPLAY_DEFAULTS.digest_timezone,
    };
  });
}
