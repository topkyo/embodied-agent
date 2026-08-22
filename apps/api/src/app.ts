import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { createLogger } from "@embodied-agent/platform";
import { normalizeDevChat } from "./chat/normalize.js";
import {
  processChatMessage,
  resolveLlmFromSettings,
  type ChatPipelineDeps,
} from "./chat/pipeline.js";
import { LlmUnavailableError } from "@embodied-agent/agent";
import { getChatChannel, resolveChatChannelId } from "./channels/registry.js";
import type { InboundWebhookPayload } from "./channels/interface.js";
import {
  getDomainPackCatalog,
  domainPackCapabilitiesFromContract,
  getPrimaryDomainPackContract,
} from "./domain-packs/loader.js";
import { createMqttContext, type MqttContext } from "@embodied-agent/node";

import { registerAdminRoutes } from "./routes/admin.js";
import { registerIntentFailuresAdminRoutes } from "./routes/intent-failures-admin.js";
import { registerIntegrationRoutes } from "./routes/integration.js";
import { registerWechatAdminRoutes } from "./routes/wechat-admin.js";
import { registerNodeRoutes } from "./routes/nodes.js";
import { registerDevFlywheelRoutes } from "./routes/dev-flywheel.js";
import { registerMetricsRoutes } from "./routes/metrics.js";
import { getEffectiveSettings } from "./settings/store.js";
import { getPlatformRuntimeContext } from "./runtime/context.js";
import { isExplicitDevEnv } from "./runtime/env-mode.js";
import {
  applyCorsHeaders,
  rejectAdminTokenFromDisallowedOrigin,
  resolveCorsAllowlist,
} from "./cors.js";
import { registerDemoReadonlyHook } from "./demo/readonly.js";
import {
  registerWebAuthDevRoutes,
  registerWebAuthRoutes,
  registerWebSessionHook,
} from "./auth/web-session/index.js";

declare module "fastify" {
  interface FastifyInstance {
    mqtt: MqttContext;
  }
}

export type BuildAppOptions = {
  logger?: boolean;
  pipeline?: Partial<ChatPipelineDeps>;
  mqttCtx?: MqttContext;
};

function resolvePipelineDeps(overrides?: Partial<ChatPipelineDeps>): ChatPipelineDeps {
  return resolveLlmFromSettings(overrides);
}

async function handleChat(
  deps: ChatPipelineDeps,
  body: Parameters<typeof normalizeDevChat>[0],
  mqttCtx: MqttContext,
) {
  const msg = normalizeDevChat(body);
  return processChatMessage(msg, deps, mqttCtx);
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: "127.0.0.1" });
  const mqttCtx = opts.mqttCtx ?? createMqttContext();
  app.decorate("mqtt", mqttCtx);
  app.decorate("runtime", getPlatformRuntimeContext());
  const explicitDevEnv = isExplicitDevEnv();
  const isProd = !explicitDevEnv;
  const relaxedRateLimit = explicitDevEnv;
  await app.register(rateLimit, {
    max: relaxedRateLimit ? 600 : 120,
    timeWindow: "1 minute",
    allowList: (req) => {
      if (req.method === "OPTIONS") return true;
      if (!relaxedRateLimit) return false;
      const ip = req.ip;
      return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
    },
  });
  app.setErrorHandler((error, request, reply) => {
    const err = error as unknown;
    const log = createLogger("fastify-error");
    log.error("unhandled request error", {
      error: err instanceof Error ? err.message : String(err),
      url: request.url,
      method: request.method,
    });
    if (err instanceof LlmUnavailableError) {
      return reply.status(503).send({ reply: "AI 服务暂时不可用，请稍后重试。" });
    }
    const statusCode =
      err &&
      typeof err === "object" &&
      "statusCode" in err &&
      typeof (err as { statusCode?: unknown }).statusCode === "number"
        ? (err as { statusCode: number }).statusCode
        : 500;
    const message =
      statusCode >= 500
        ? "服务器内部错误，请稍后重试。"
        : err instanceof Error
          ? err.message
          : "请求处理失败。";
    return reply.status(statusCode).send({ reply: message });
  });
  const pipelineOverrides = opts.pipeline;
  const corsAllowlist = resolveCorsAllowlist(process.env.CORS_ORIGIN, isProd);
  if (isProd && process.env.CHAT_CHANNEL === "wechat-stub") {
    throw new Error("CHAT_CHANNEL=wechat-stub is dev-only and must not be used in production");
  }
  if (isProd && process.env.ENABLE_DEV_CHAT === "1" && !process.env.DEV_CHAT_SECRET?.trim()) {
    throw new Error("ENABLE_DEV_CHAT=1 in production requires DEV_CHAT_SECRET");
  }

  app.addHook("onRequest", async (request, reply) => {
    const cors = applyCorsHeaders(request, reply, corsAllowlist);
    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }
    if (rejectAdminTokenFromDisallowedOrigin(request, cors)) {
      return reply
        .status(403)
        .send({ error: `origin 不在 CORS allowlist 内，拒绝 x-admin-token 请求：${cors.origin}` });
    }
  });
  registerDemoReadonlyHook(app);
  await registerWebSessionHook(app, { isProd });

  await registerWebAuthRoutes(app, { isProd });
  await registerWebAuthDevRoutes(app);
  await registerAdminRoutes(app);
  await registerIntentFailuresAdminRoutes(app);
  await registerWechatAdminRoutes(app);
  await registerNodeRoutes(app);
  await registerIntegrationRoutes(app, () => resolvePipelineDeps(pipelineOverrides));
  await registerDevFlywheelRoutes(app);
  await registerMetricsRoutes(app);

  app.post<{ Body: { text: string; user_id?: string; conversation_id?: string } }>(
    "/dev/chat",
    async (request, reply) => {
      if (!isExplicitDevEnv() && process.env.ENABLE_DEV_CHAT !== "1") {
        return reply.status(404).send({ reply: "Not found" });
      }
      const devSecret = process.env.DEV_CHAT_SECRET?.trim();
      if (!isExplicitDevEnv() || devSecret) {
        if (!devSecret) {
          return reply.status(503).send({ reply: "dev chat 未配置 DEV_CHAT_SECRET。" });
        }
        const header = request.headers["x-dev-chat-secret"];
        if (typeof header !== "string" || header !== devSecret) {
          return reply.status(401).send({ reply: "dev chat 鉴权失败。" });
        }
      }
      if (!request.body?.text?.trim()) {
        return reply.status(400).send({ reply: "缺少 text 字段。" });
      }
      if (!request.body.user_id?.trim() || !request.body.conversation_id?.trim()) {
        return reply.status(400).send({ reply: "需要 user_id 和 conversation_id。" });
      }
      try {
        const deps = resolvePipelineDeps(pipelineOverrides);
        const result = await handleChat(
          deps,
          {
            text: request.body.text,
            user_id: request.body.user_id,
            conversation_id: request.body.conversation_id,
          },
          app.mqtt,
        );
        return reply.status(result.status).send({ reply: result.reply });
      } catch (e) {
        if (e instanceof LlmUnavailableError) {
          return reply.status(503).send({ reply: "AI 服务暂时不可用，请稍后重试。" });
        }
        throw e;
      }
    },
  );

  app.post<{ Body: InboundWebhookPayload }>("/webhooks/chat", async (request, reply) => {
    const channel = getChatChannel();
    const body = (request.body ?? {}) as InboundWebhookPayload;

    if (!channel) {
      return reply
        .status(404)
        .send({ reply: "未配置 webhook channel；请使用 /integrations/chat。" });
    }

    if (!channel.verifySignature(request.headers, body)) {
      return reply.status(401).send({ reply: "签名校验失败。" });
    }
    let msg;
    try {
      msg = channel.normalizeInbound(body);
    } catch (e) {
      return reply.status(400).send({
        reply: e instanceof Error ? e.message : "消息字段无效。",
      });
    }
    if (!msg.text.trim()) {
      return reply.status(400).send({ reply: "缺少消息内容。" });
    }
    try {
      const deps = resolvePipelineDeps(pipelineOverrides);
      const result = await processChatMessage(msg, deps, app.mqtt);
      await channel.sendReply(msg, result.reply);
      return reply.status(result.status).send({ reply: result.reply });
    } catch (e) {
      if (e instanceof LlmUnavailableError) {
        return reply.status(503).send({ reply: "AI 服务暂时不可用，请稍后重试。" });
      }
      throw e;
    }
  });

  app.get("/channels", async () => ({
    active: resolveChatChannelId(),
    registered: ["dev", "wechat-stub"],
  }));

  app.get("/domain-packs", async () => {
    const settings = getEffectiveSettings();
    const ctx = getPlatformRuntimeContext();
    const activeContract = getPrimaryDomainPackContract(ctx.loader, settings);
    return {
      catalog: getDomainPackCatalog(ctx.loader).map((entry) => ({
        id: entry.id,
        display_name: entry.displayName,
        web_slug: entry.webSlug,
        status: entry.status,
        active: settings.active_domain === entry.id,
        ...(settings.active_domain === entry.id
          ? { capabilities: domainPackCapabilitiesFromContract(activeContract) }
          : {}),
      })),
      active_domain: settings.active_domain,
      deployment_id: settings.deployment_id,
    };
  });

  app.get("/lang-suggest", async (request, _reply) => {
    const headers = request.headers as Record<string, string | string[] | undefined>;
    const country = String(
      headers["x-vercel-ip-country"] ||
        headers["cf-ipcountry"] ||
        headers["x-country"] ||
        headers["x-forwarded-country"] ||
        "",
    )
      .toUpperCase()
      .trim()
      .slice(0, 2);
    const lang = country ? (["CN", "TW", "HK", "MO"].includes(country) ? "zh" : "en") : "zh";
    return {
      lang,
      country: country || null,
      source: country ? "geo-header" : "default",
    };
  });

  app.get("/health", async () => ({ ok: true }));

  return app;
}
