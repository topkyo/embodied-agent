import type { FastifyInstance, FastifyRequest } from "fastify";
import { safeEqualString } from "@embodied-agent/platform";
import { getMetricsRegistry } from "../runtime/metrics-holder.js";

const PROCESS_START_TIME = Date.now();

function extractMetricsToken(request: FastifyRequest): string | undefined {
  const headerToken = request.headers["x-metrics-token"];
  if (typeof headerToken === "string" && headerToken.trim()) {
    return headerToken.trim();
  }
  const auth = request.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice("bearer ".length).trim();
    return token || undefined;
  }
  return undefined;
}

/**
 * 注册 Prometheus 兼容的 /metrics 端点。
 *
 * - 未设置 METRICS_SCRAPE_TOKEN：保持公开（仅建议在 dev / 或生产显式 METRICS_ALLOW_PUBLIC=1）。
 * - 设置 METRICS_SCRAPE_TOKEN：要求 `Authorization: Bearer <token>` 或 `x-metrics-token`。
 */
export async function registerMetricsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/metrics", async (request, reply) => {
    const expected = process.env.METRICS_SCRAPE_TOKEN?.trim();
    if (expected) {
      const provided = extractMetricsToken(request);
      if (!provided || !safeEqualString(provided, expected)) {
        return reply.status(401).send({ error: "metrics_unauthorized" });
      }
    }
    const registry = getMetricsRegistry();
    registry.setUptime((Date.now() - PROCESS_START_TIME) / 1000);
    reply.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return reply.send(registry.renderPrometheus());
  });
}
