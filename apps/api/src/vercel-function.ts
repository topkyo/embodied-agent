import type { FastifyInstance } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "./create-api-app.js";

let appPromise: Promise<FastifyInstance> | undefined;

async function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    if (!process.env.AGENT_DATA_DIR?.trim()) {
      throw new Error(
        "生产环境必须显式配置 AGENT_DATA_DIR（Vercel serverless 不可使用 /tmp 易失目录）。",
      );
    }
    process.env.CORS_ORIGIN ??= process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    appPromise = createApiApp().then(async (app) => {
      await app.ready();
      return app;
    });
  }

  return appPromise;
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const app = await getApp();
  if (request.url?.startsWith("/api/")) {
    request.url = request.url.slice("/api".length) || "/";
  }
  app.server.emit("request", request, response);
}
