import type { FastifyInstance } from "fastify";
import { createLogger, safeEqualString } from "@embodied-agent/platform";
import { getEffectiveSettings } from "../settings/store.js";
import { processChatMessage, type ChatPipelineDeps } from "../chat/pipeline.js";
import { LlmUnavailableError } from "@embodied-agent/agent";
import { resolveInboundUtterance } from "../chat/resolve-utterance.js";
import type { NormalizedChatMessage } from "../chat/types.js";
import { resolvePlatformUser } from "../auth/platform-bind.js";
import { resolveWechatPrincipal } from "../wechat/resolve-wechat-principal.js";
import { USER_REPLY, replyForChatInputError } from "../chat/user-messages.js";
import { isExplicitDevEnv } from "../runtime/env-mode.js";

const log = createLogger("integration");

function verifyIntegrationSecret(authHeader: string | undefined): boolean {
  const secret = getEffectiveSettings().integration_secret;
  if (!secret) {
    return isExplicitDevEnv();
  }
  if (!authHeader?.startsWith("Bearer ")) return false;
  return safeEqualString(authHeader.slice(7), secret);
}

function resolveIntegrationUserId(platform: string, userId: string): string | null {
  if (platform === "wechat") {
    return resolveWechatPrincipal(userId);
  }
  const fromPlatform = resolvePlatformUser(platform, userId);
  if (fromPlatform) return fromPlatform.user_id;
  return null;
}

export async function registerIntegrationRoutes(
  app: FastifyInstance,
  resolveDeps: () => ChatPipelineDeps,
): Promise<void> {
  app.post<{
    Body: {
      text?: string;
      audio_base64?: string;
      audio_format?: string;
      user_id?: string;
      conversation_id?: string;
      deployment_id?: string;
      platform?: string;
    };
  }>(
    "/integrations/chat",
    {
      preValidation: async (request, reply) => {
        const auth = request.headers.authorization;
        if (!verifyIntegrationSecret(typeof auth === "string" ? auth : undefined)) {
          return reply.status(401).send({ reply: USER_REPLY.integrationAuthFailed });
        }
      },
      schema: {
        body: {
          type: "object",
          properties: {
            text: { type: "string" },
            audio_base64: { type: "string" },
            audio_format: { type: "string" },
            user_id: { type: "string" },
            conversation_id: { type: "string" },
            deployment_id: { type: "string" },
            platform: { type: "string" },
          },
          required: ["platform", "user_id"],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const {
        text,
        audio_base64,
        audio_format,
        user_id,
        conversation_id,
        deployment_id,
        platform,
      } = request.body ?? {};

      const platformId = platform!.trim();
      const externalUserId = (user_id ?? "").trim();
      if (!externalUserId) {
        return reply.status(200).send({ reply: USER_REPLY.needContent });
      }

      const principalUserId = resolveIntegrationUserId(platformId, externalUserId);
      if (!principalUserId) {
        return reply.status(200).send({ reply: USER_REPLY.notBound });
      }

      let utterance: string;
      try {
        const resolved = await resolveInboundUtterance({
          text,
          audio_base64,
          audio_format,
        });
        utterance = resolved.text;
      } catch (e) {
        const mapped = replyForChatInputError(e);
        log.warn("integration utterance resolve failed", {
          error: e instanceof Error ? e.message : String(e),
        });
        return reply.status(mapped.status).send({ reply: mapped.reply });
      }

      const msg: NormalizedChatMessage = {
        platform: platformId,
        user_id: principalUserId,
        conversation_id: conversation_id ?? externalUserId,
        text: utterance,
        timestamp: new Date().toISOString(),
      };

      try {
        const settings = getEffectiveSettings();
        if (deployment_id && deployment_id !== settings.deployment_id) {
          return reply.status(400).send({
            reply: `deployment_id 与当前运行时 ${settings.deployment_id} 不一致。`,
          });
        }
        const result = await processChatMessage(msg, resolveDeps(), request.server.mqtt);
        return reply.status(result.status).send({
          reply: result.reply,
          ...(result.command_id ? { command_id: result.command_id } : {}),
          ...(result.execution_transport
            ? { execution_transport: result.execution_transport }
            : {}),
          ...(result.lifecycle_state ? { lifecycle_state: result.lifecycle_state } : {}),
          ...(result.params ? { params: result.params } : {}),
        });
      } catch (e) {
        if (e instanceof LlmUnavailableError) {
          log.warn("integration llm unavailable", {
            error: e instanceof Error ? e.message : String(e),
          });
          return reply.status(503).send({ reply: USER_REPLY.llmUnavailable });
        }
        throw e;
      }
    },
  );
}
