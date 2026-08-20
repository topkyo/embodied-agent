import type { FastifyInstance } from "fastify";
import { createLogger } from "@embodied-agent/platform";
import { getAdminActor } from "../routes/admin-auth.js";

const auditLog = createLogger("admin-audit");
const WRITE_METHODS = new Set(["POST", "PUT", "DELETE"]);

export function registerAdminAuditHook(app: FastifyInstance): void {
  app.addHook("onResponse", async (request, reply) => {
    const path = request.url.split("?")[0] ?? request.url;
    if (!path.startsWith("/admin/")) return;
    if (!WRITE_METHODS.has(request.method)) return;

    auditLog.info("admin write", {
      actor: getAdminActor(request) ?? null,
      method: request.method,
      path,
      status: reply.statusCode,
    });
  });
}
