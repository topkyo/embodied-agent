import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../admin-auth.js";
import {
  claimPairingCode,
  issuePairingCode,
  listBindings,
  upsertBinding,
} from "../../auth/platform-bind.js";

export function registerAdminBindingsRoutes(app: FastifyInstance): void {
  app.get("/admin/bindings", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return { bindings: listBindings() };
  });

  app.post<{
    Body: {
      platform: string;
      platform_user_id: string;
      principal_user_id: string;
    };
  }>("/admin/bindings", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const platform = String(body.platform ?? "");
    const platform_user_id = String(body.platform_user_id ?? "");
    const principal_user_id = String(body.principal_user_id ?? "");
    if (!platform.trim() || !platform_user_id.trim() || !principal_user_id.trim()) {
      return reply.status(400).send({ error: "missing_fields" });
    }
    try {
      const row = upsertBinding(platform, platform_user_id, principal_user_id);
      return { ok: true, binding: row };
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : "bind_failed",
      });
    }
  });

  app.post<{
    Body: {
      principal_user_id: string;
      ttl_minutes?: number;
      domain?: string;
      deployment_id?: string;
    };
  }>("/admin/bindings/issue-code", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const principalUserId = String(body.principal_user_id ?? "").trim();
    if (!principalUserId) {
      return reply.status(400).send({ error: "missing principal_user_id" });
    }
    try {
      const ttlMinutes = typeof body.ttl_minutes === "number" ? body.ttl_minutes : 30;
      const domainPack = typeof body.domain === "string" ? body.domain.trim() : undefined;
      const deploymentId =
        typeof body.deployment_id === "string" ? body.deployment_id.trim() : undefined;
      const entry = issuePairingCode(principalUserId, {
        ttlMinutes,
        domain: domainPack,
        deployment_id: deploymentId,
      });
      return {
        ok: true,
        code: entry.code,
        principal_user_id: entry.principal_user_id,
        expires_at: entry.expires_at,
        domain: entry.domain ?? null,
        deployment_id: entry.deployment_id ?? null,
      };
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : "issue_failed",
      });
    }
  });

  app.post<{
    Body: { code: string; platform: string; platform_user_id: string };
  }>("/admin/bindings/claim", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const { code, platform, platform_user_id } = request.body ?? {};
    if (!code?.trim() || !platform?.trim() || !platform_user_id?.trim()) {
      return reply.status(400).send({ error: "missing_fields" });
    }
    try {
      const row = claimPairingCode(code.trim(), platform.trim(), platform_user_id.trim());
      return { ok: true, binding: row };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "claim_failed";
      return reply.status(400).send({ error: msg });
    }
  });
}
