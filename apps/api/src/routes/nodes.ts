import { createLogger } from "@embodied-agent/platform";
import type { FastifyInstance } from "fastify";
import {
  claimNodeInstallCode,
  getNode,
  issueNodeToken,
  upsertNodeInRegistry,
  validateNodeToken,
} from "@embodied-agent/node";
import type { Node } from "@embodied-agent/core";
import { resolveConfiguredMqttUrl } from "../mqtt/url.js";

const log = createLogger("nodes-register");

export async function registerNodeRoutes(app: FastifyInstance): Promise<void> {
  // ESP32 Scene Node 自注册：使用安装码换取 node_token + 进入 pending
  // 安装码消费后立即失效；节点需持久化 node_token 用于后续心跳/上报
  app.post<{
    Body: {
      deployment_id: string;
      install_code: string;
      node_id: string;
      node_token?: string;
      firmware_version?: string;
      capabilities?: unknown; // 第一版暂存，绑定时用于生成 devices；不直接信任为事实
    };
  }>(
    "/nodes/register",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            deployment_id: { type: "string" },
            install_code: { type: "string" },
            node_id: { type: "string" },
            node_token: { type: "string" },
            firmware_version: { type: "string" },
            capabilities: {},
          },
          required: ["deployment_id", "install_code", "node_id"],
          additionalProperties: false,
        },
      },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const { deployment_id, install_code, node_id, firmware_version, node_token } =
        request.body ?? {};
      if (!deployment_id?.trim() || !install_code?.trim() || !node_id?.trim()) {
        return reply.status(400).send({
          ok: false,
          error: "missing_deployment_id_install_code_or_node_id",
        });
      }

      const deploymentId = deployment_id.trim();
      const nodeId = node_id.trim();
      const now = new Date().toISOString();
      const fw = firmware_version?.trim() || "0.1.0";

      let existing: Node | undefined;
      try {
        existing = getNode(deploymentId, nodeId);
      } catch (e) {
        return reply.status(500).send({
          ok: false,
          error: "registry_update_failed",
          message: e instanceof Error ? e.message : String(e),
        });
      }
      const wasActive = existing?.status === "active";

      if (wasActive) {
        const presented = node_token?.trim();
        try {
          if (!presented || !validateNodeToken(deploymentId, nodeId, presented)) {
            return reply.status(409).send({
              ok: false,
              error: "node_already_active",
              message: "节点已激活；重注册需携带现有 node_token，或先由管理员解绑。",
            });
          }
        } catch (e) {
          return reply.status(500).send({
            ok: false,
            error: "registry_update_failed",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }

      let scene: { deployment_id: string; entity_id?: string };
      try {
        scene = claimNodeInstallCode(deploymentId, install_code, nodeId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "invalid_install_code";
        return reply.status(400).send({ ok: false, error: msg });
      }

      let upserted: Node;
      try {
        if (wasActive && existing) {
          upserted = {
            ...existing,
            firmware_version: fw,
            last_seen_at: now,
          };
        } else {
          upserted = {
            node_id: nodeId,
            deployment_id: scene.deployment_id,
            entity_id: scene.entity_id,
            firmware_version: fw,
            status: "pending",
            registered_at: existing?.registered_at ?? now,
            last_seen_at: now,
          };
        }
        upsertNodeInRegistry(upserted);
      } catch (e) {
        return reply.status(500).send({
          ok: false,
          error: "registry_update_failed",
          message: e instanceof Error ? e.message : String(e),
        });
      }

      const issuedToken = issueNodeToken(upserted.deployment_id, upserted.node_id);

      const pairingMqttUrl = resolveConfiguredMqttUrl();
      if (pairingMqttUrl && app.mqtt?.publisher) {
        try {
          const pub = app.mqtt.publisher.get(pairingMqttUrl);
          await pub.clearPairingInstallCode(deploymentId, nodeId);
        } catch (e) {
          log.warn("MQTT pairing code clear failed (non-fatal)", {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      return {
        ok: true,
        status: upserted.status,
        node_id: upserted.node_id,
        deployment_id: upserted.deployment_id,
        entity_id: upserted.entity_id,
        node_token: issuedToken,
        message: wasActive
          ? "节点已重新注册。"
          : "节点已注册，等待管理员确认设备绑定。",
      };
    },
  );
}
