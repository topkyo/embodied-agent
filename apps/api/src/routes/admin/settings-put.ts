import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { isValidMqttUrl } from "../../mqtt/url.js";
import {
  getEffectiveSettings,
  saveSettings,
  toPublicSettings,
} from "../../settings/store.js";
import { requireAdmin } from "../admin-auth.js";
import {
  getDomainPackCatalog,
  getPrimaryDomainPackContract,
  preloadDomainPacks,
} from "../../domain-packs/loader.js";
import { syncActivePackServicesForContract } from "../../domain-packs/services.js";
import { assertRequiredServicesForPack } from "@embodied-agent/runtime";
import { getPlatformRuntimeContext } from "../../runtime/context.js";
import { restartDomainCapabilitySchedulers } from "../../jobs/domain-schedulers.js";
import { restartMqttSubscribers } from "../../jobs/start.js";
import { loadRegistry } from "@embodied-agent/node";
import { settingsSaveNote } from "./settings-save-note.js";
import {
  applyBasicPatchFields,
  blockingConfigRegistryReadinessIssues,
  type SettingsPutBody,
} from "./settings-helpers.js";

export function registerSettingsPutRoute(app: FastifyInstance): void {
  app.put<{
    Body: SettingsPutBody;
  }>("/admin/settings", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const body = (request.body ?? {}) as SettingsPutBody;
    const patch = applyBasicPatchFields(body);

    if (typeof body.active_domain === "string") {
      const requestedDomain = body.active_domain.trim();
      const catalogEntry = getDomainPackCatalog(getPlatformRuntimeContext().loader).find(
        (entry) => entry.id === requestedDomain,
      );
      if (!catalogEntry || catalogEntry.status !== "live") {
        return reply.status(400).send({
          error: `active_domain ${requestedDomain || "(empty)"} 不是可启用的 live Domain Pack。`,
        });
      }
      await preloadDomainPacks(getPlatformRuntimeContext().loader, { packIds: [requestedDomain] });
      const effectiveSettings = getEffectiveSettings();
      const prospectiveDeploymentId = patch.deployment_id ?? effectiveSettings.deployment_id;
      const targetContract = getPrimaryDomainPackContract(getPlatformRuntimeContext().loader, {
        ...effectiveSettings,
        active_domain: requestedDomain,
      });
      const missing = assertRequiredServicesForPack(
        getPlatformRuntimeContext().services,
        targetContract,
        requestedDomain,
      );
      if (missing.length > 0) {
        return reply.status(400).send({
          error: `active_domain ${requestedDomain} 缺少必需平台服务：${missing.map((issue) => issue.message).join("; ")}`,
        });
      }
      const targetDomainConfig =
        body.domain_configs?.[requestedDomain] ??
        effectiveSettings.domain_configs?.[requestedDomain];
      const blockingReadiness = blockingConfigRegistryReadinessIssues(
        targetContract,
        prospectiveDeploymentId,
        targetDomainConfig,
      );
      if (blockingReadiness.length > 0) {
        return reply.status(400).send({
          error: `active_domain ${requestedDomain} 配置/registry 不满足 readiness：${blockingReadiness.map((item) => item.message).join("; ")}`,
        });
      }
      const effectiveMqttUrl = (
        typeof body.mqtt_url === "string"
          ? body.mqtt_url.trim()
          : (effectiveSettings.mqtt_url ?? "")
      ).trim();
      const requiresMqtt = (targetContract.core.readiness?.requiredTransports ?? []).includes(
        "mqtt",
      );
      if (requiresMqtt && !effectiveMqttUrl) {
        return reply.status(400).send({
          error: `active_domain ${requestedDomain} 要求 mqtt_url，不能切换到未配置 MQTT 的部署。`,
        });
      }
      patch.active_domain = requestedDomain;
    }
    if (patch.deployment_id && patch.deployment_id !== getEffectiveSettings().deployment_id) {
      const effectiveSettings = getEffectiveSettings();
      const registry = loadRegistry();
      const targetDeployment = registry.deployments.find(
        (d) => d.deployment_id === patch.deployment_id,
      );
      if (!targetDeployment || targetDeployment.status !== "active") {
        return reply.status(400).send({
          error: `deployment_id ${patch.deployment_id} 未在 registry 注册或未启用。`,
        });
      }
      const activeDomain = patch.active_domain ?? effectiveSettings.active_domain;
      if (!activeDomain) {
        return reply.status(400).send({
          error: "active_domain 未配置：请先显式启用一个 live Domain Pack。",
        });
      }
      const targetContract = getPrimaryDomainPackContract(getPlatformRuntimeContext().loader, {
        ...effectiveSettings,
        active_domain: activeDomain,
      });
      const targetDomainConfig =
        body.domain_configs?.[activeDomain] ?? effectiveSettings.domain_configs?.[activeDomain];
      const blockingReadiness = blockingConfigRegistryReadinessIssues(
        targetContract,
        patch.deployment_id,
        targetDomainConfig,
      );
      if (blockingReadiness.length > 0) {
        return reply.status(400).send({
          error: `deployment_id ${patch.deployment_id} 配置/registry 不满足 readiness：${blockingReadiness.map((item) => item.message).join("; ")}`,
        });
      }
    }
    if (body.domain_configs && typeof body.domain_configs === "object") {
      const effectiveSettings = getEffectiveSettings();
      const activeDomain = patch.active_domain ?? effectiveSettings.active_domain;
      if (!activeDomain) {
        return reply.status(400).send({
          error: "active_domain 未配置，不能保存 domain_configs。",
        });
      }
      const keys = Object.keys(body.domain_configs);
      const invalidKeys = keys.filter((key) => key !== activeDomain);
      if (invalidKeys.length > 0) {
        return reply.status(400).send({
          error: `domain_configs 只能保存当前 active_domain (${activeDomain}) 的配置；拒绝: ${invalidKeys.join(", ")}`,
        });
      }
      const prospectiveDeploymentId = patch.deployment_id ?? effectiveSettings.deployment_id;
      const nextDomainConfig = body.domain_configs[activeDomain] ?? {};
      const configContract = getPrimaryDomainPackContract(getPlatformRuntimeContext().loader, {
        ...effectiveSettings,
        active_domain: activeDomain,
      });
      const blockingReadiness = blockingConfigRegistryReadinessIssues(
        configContract,
        prospectiveDeploymentId,
        nextDomainConfig,
      );
      if (blockingReadiness.length > 0) {
        return reply.status(400).send({
          error: `domain_configs (${activeDomain}) 不满足 readiness：${blockingReadiness.map((item) => item.message).join("; ")}`,
        });
      }
      patch.domain_configs = {
        [activeDomain]: nextDomainConfig,
      };
    }

    if (body.mqtt_url !== undefined) {
      const nextMqttUrl = typeof body.mqtt_url === "string" ? body.mqtt_url.trim() : "";
      if (nextMqttUrl && !isValidMqttUrl(nextMqttUrl)) {
        return reply.status(400).send({
          error: `mqtt_url 无效：${nextMqttUrl}（须为 mqtt:// mqtts:// ws:// wss:// 且含 host）。`,
        });
      }
      const effectiveSettings = getEffectiveSettings();
      const activeDomain = patch.active_domain ?? effectiveSettings.active_domain;
      if (activeDomain) {
        const contract = getPrimaryDomainPackContract(getPlatformRuntimeContext().loader, {
          ...effectiveSettings,
          active_domain: activeDomain,
        });
        const requiresMqtt = (contract.core.readiness?.requiredTransports ?? []).includes("mqtt");
        if (requiresMqtt && !nextMqttUrl) {
          return reply.status(400).send({
            error: `active_domain ${activeDomain} 要求 mqtt_url，不能保存空值。`,
          });
        }
      }
      patch.mqtt_url = nextMqttUrl;
    }

    const previousSettings = getEffectiveSettings();
    const previousDomain = previousSettings.active_domain;
    const previousMqttUrl = previousSettings.mqtt_url;
    const saved = saveSettings(patch);
    if (patch.active_domain && patch.active_domain !== previousDomain) {
      syncActivePackServicesForContract(
        getPlatformRuntimeContext(),
        patch.active_domain,
        getPrimaryDomainPackContract(getPlatformRuntimeContext().loader, {
          ...saved,
          active_domain: patch.active_domain,
        }),
      );
      restartDomainCapabilitySchedulers();
    }
    if (patch.mqtt_url !== undefined && patch.mqtt_url !== previousMqttUrl) {
      void restartMqttSubscribers(app.mqtt);
    }
    const note = settingsSaveNote(patch as Record<string, unknown>);
    return {
      ok: true,
      settings: toPublicSettings(saved),
      ...(note ? { note } : {}),
    };
  });
}
