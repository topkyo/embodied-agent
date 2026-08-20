import { createLogger } from "@embodied-agent/platform";
import type { FastifyInstance } from "fastify";

import type { Node } from "@embodied-agent/core";
import { getEffectiveSettings } from "../../settings/store.js";
import { resolveConfiguredMqttUrl } from "../../mqtt/url.js";
import { requireAdmin, requireOperator } from "../admin-auth.js";
import { issueNodeInstallCode, listActiveInstallCodes } from "@embodied-agent/node";
import { applyNodeBinding, listNodes, type BindingDeviceInput } from "@embodied-agent/node";
import { getNodeRuntimeStatus } from "../../nodes/online-status.js";
import { publishRegistryNodeConfig } from "@embodied-agent/node";
import { resolveDomainPackWebSlug } from "../../domain-packs/loader.js";
import { getPlatformRuntimeContext } from "../../runtime/context.js";

const log = createLogger("admin-nodes");

function activeDomainPairRoute(activeDomain: string | undefined, nodeId: string): string {
  if (!activeDomain?.trim()) {
    throw new Error("active_domain 未配置，无法生成 Web 配对入口。");
  }
  const slug = resolveDomainPackWebSlug(getPlatformRuntimeContext().loader, activeDomain.trim());
  return `/scenes/${encodeURIComponent(slug)}/ops/devices/pair?node_id=${encodeURIComponent(nodeId)}`;
}

export function registerAdminNodesRoutes(app: FastifyInstance): void {
  // Scene Node 安装码：管理员为某农场/大棚生成一次性安装码
  app.post<{
    Body: { deployment_id: string; entity_id?: string; ttl_minutes?: number; node_id?: string };
  }>("/admin/node-install-codes", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const { deployment_id, entity_id, ttl_minutes, node_id } = request.body ?? {};
    if (!deployment_id?.trim()) {
      return reply.status(400).send({ error: "missing_deployment_id" });
    }
    const settings = getEffectiveSettings();
    if (deployment_id.trim() !== settings.deployment_id) {
      return reply.status(400).send({ error: "deployment_not_active" });
    }
    try {
      const entry = issueNodeInstallCode({
        deployment_id: deployment_id.trim(),
        entity_id: entity_id?.trim() || undefined,
        ttl_minutes: ttl_minutes ?? 30,
        node_id: node_id?.trim() || undefined,
      });
      return {
        ok: true,
        install_code: entry.install_code,
        deployment_id: entry.deployment_id,
        entity_id: entry.entity_id,
        expires_at: entry.expires_at,
      };
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : "issue_install_code_failed",
      });
    }
  });

  app.get("/admin/node-install-codes", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const settings = getEffectiveSettings();
    const codes = listActiveInstallCodes(settings.deployment_id);
    return { codes, count: codes.length };
  });

  // 扫码配对：生成安装码并经 MQTT retained 下发到节点（无需现场手输 DF-xxxx）
  app.post<{
    Params: { node_id: string };
    Body: { deployment_id: string; entity_id?: string; ttl_minutes?: number };
  }>("/admin/nodes/:node_id/pair", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const nodeId = request.params.node_id?.trim();
    const { deployment_id, entity_id, ttl_minutes } = request.body ?? {};
    if (!nodeId || !deployment_id?.trim()) {
      return reply.status(400).send({ error: "missing_node_id_or_deployment_id" });
    }
    const settings = getEffectiveSettings();
    if (deployment_id.trim() !== settings.deployment_id) {
      return reply.status(400).send({ error: "deployment_not_active" });
    }
    try {
      const pairUrl = activeDomainPairRoute(settings.active_domain, nodeId);
      const entry = issueNodeInstallCode({
        deployment_id: deployment_id.trim(),
        entity_id: entity_id?.trim() || undefined,
        ttl_minutes: ttl_minutes ?? 30,
        node_id: nodeId,
      });
      let mqttPublished = false;
      const pairingMqttUrl = resolveConfiguredMqttUrl();
      if (pairingMqttUrl) {
        try {
          const pub = app.mqtt.publisher.get(pairingMqttUrl);
          await pub.publishPairingInstallCode({
            deployment_id: entry.deployment_id,
            node_id: nodeId,
            entity_id: entry.entity_id,
            install_code: entry.install_code,
            expires_at: entry.expires_at,
          });
          mqttPublished = true;
        } catch (pubErr) {
          log.warn("MQTT pairing publish failed (non-fatal)", {
            error: pubErr instanceof Error ? pubErr.message : String(pubErr),
          });
        }
      }
      return {
        ok: true,
        node_id: nodeId,
        install_code: entry.install_code,
        deployment_id: entry.deployment_id,
        entity_id: entry.entity_id,
        expires_at: entry.expires_at,
        mqtt_published: mqttPublished,
        pair_url: pairUrl,
      };
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : "pair_failed",
      });
    }
  });

  // 待绑定/全部节点查询（支持 ?status=pending）；任意 web session 可读
  app.get<{
    Querystring: { status?: string };
  }>("/admin/nodes", async (request, reply) => {
    if (!requireOperator(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const status = request.query.status as Node["status"] | undefined;
    const settings = getEffectiveSettings();
    const filtered = listNodes(settings.deployment_id, status).map((n) => ({
      ...n,
      ...getNodeRuntimeStatus(n.node_id, Date.now(), n.deployment_id),
    }));
    return { nodes: filtered, count: filtered.length };
  });

  // 管理员绑定节点到场景 + 提供/确认设备列表（生成 devices + 激活 node + 递增 config_version）
  app.put<{
    Params: { node_id: string };
    Body: {
      deployment_id: string;
      entity_id?: string;
      devices: BindingDeviceInput[];
    };
  }>("/admin/nodes/:node_id/binding", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const nodeId = request.params.node_id?.trim();
    const { deployment_id, entity_id, devices } = request.body ?? {};
    if (!nodeId || !deployment_id?.trim() || !Array.isArray(devices)) {
      return reply.status(400).send({ error: "missing_node_id_or_deployment_or_devices" });
    }
    const s = getEffectiveSettings();
    if (deployment_id.trim() !== s.deployment_id) {
      return reply.status(400).send({ error: "deployment_not_active" });
    }
    try {
      const result = applyNodeBinding(
        nodeId,
        deployment_id.trim(),
        entity_id?.trim() || undefined,
        devices as BindingDeviceInput[],
      );

      // 发布 retained node config （步骤5）
      let configPublished = false;
      let config_publish_error: string | undefined;
      const bindingMqttUrl = resolveConfiguredMqttUrl();
      if (bindingMqttUrl) {
        try {
          const pub = app.mqtt.publisher.get(bindingMqttUrl);
          const published = await publishRegistryNodeConfig(pub, nodeId, deployment_id.trim());
          configPublished = published.ok;
          if (!published.ok) {
            config_publish_error = published.error;
            log.warn("retained config publish failed", { error: published.error });
          }
        } catch (pubErr) {
          config_publish_error = pubErr instanceof Error ? pubErr.message : "mqtt_publish_failed";
          log.warn("retained config publish failed", {
            error: pubErr instanceof Error ? pubErr.message : String(pubErr),
          });
        }
      }

      return {
        ok: true,
        node: {
          node_id: result.node.node_id,
          status: result.node.status,
          config_version: result.node.config_version,
          deployment_id: result.node.deployment_id,
          entity_id: result.node.entity_id,
        },
        config_published: configPublished,
        ...(config_publish_error ? { config_publish_error } : {}),
      };
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : "binding_failed",
      });
    }
  });
}
