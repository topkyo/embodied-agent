import type { FastifyInstance } from "fastify";
import { createLogger } from "@embodied-agent/platform";
import { createApiApp } from "./create-api-app.js";
import { startWechatBridgeIfConfigured, stopWechatBridge } from "./wechat/ilink-bridge.js";
import { startBackgroundJobs, stopBackgroundJobs } from "./jobs/start.js";
import { createMqttContext } from "@embodied-agent/node";
export { bindRuntimeLayers } from "./runtime/bindings.js";

const log = createLogger("bootstrap");
let shuttingDown = false;

async function shutdown(app: FastifyInstance, signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("shutdown started", { signal });
  stopWechatBridge();
  await stopBackgroundJobs();
  await app.close();
  log.info("shutdown complete");
  if (process.env.NODE_ENV === "production") {
    process.exit(0);
  }
}

function registerShutdownHandlers(app: FastifyInstance): void {
  const isProd = process.env.NODE_ENV === "production";
  const onSignal = (signal: string) => {
    void shutdown(app, signal).catch((err) => {
      log.error("shutdown failed", { error: err instanceof Error ? err.message : String(err) });
      process.exit(1);
    });
  };
  // tsx watch uses SIGTERM to hot-reload; intercepting it in dev causes restart loops.
  if (isProd) {
    process.once("SIGTERM", () => onSignal("SIGTERM"));
  }
  process.once("SIGINT", () => onSignal("SIGINT"));
}

export async function bootstrap(): Promise<void> {
  const port = Number(process.env.PORT ?? 3001);
  // VPS / production: prefer loopback (Caddy/Tunnel front). Override with HOST=0.0.0.0 for bare bind.
  const host =
    process.env.HOST ??
    (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");
  const mqttCtx = createMqttContext();
  const app = await createApiApp({ logger: true, mqttCtx });
  registerShutdownHandlers(app);
  await app.listen({ port, host });
  log.info("api listening", { host, port });

  startWechatBridgeIfConfigured(mqttCtx);
  await startBackgroundJobs(mqttCtx);
}
