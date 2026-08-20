import type { FastifyInstance } from "fastify";
import { buildApp, type BuildAppOptions } from "./app.js";
import { initRuntime } from "./runtime/init.js";

export async function createApiApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  await initRuntime();
  return buildApp(opts);
}
