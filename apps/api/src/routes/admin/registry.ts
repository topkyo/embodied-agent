import type { FastifyInstance } from "fastify";
import type { DeviceRegistry } from "@embodied-agent/core";
import { requireAdmin } from "../admin-auth.js";
import { loadRegistry, saveRegistry } from "@embodied-agent/node";

export function registerAdminRegistryRoutes(app: FastifyInstance): void {
  app.get("/admin/registry", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return loadRegistry();
  });

  app.put<{ Body: DeviceRegistry }>("/admin/registry", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    try {
      const saved = saveRegistry(request.body);
      return { ok: true, registry: saved };
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : "invalid_registry",
      });
    }
  });
}
