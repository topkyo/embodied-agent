import type { FastifyInstance } from "fastify";
import { requireAdmin, getAdminActor } from "../admin-auth.js";
import {
  addAdminToken,
  generateAdminTokenValue,
  listPublicAdminTokens,
  removeAdminToken,
} from "../../settings/admin-tokens.js";

export function registerSettingsTokenRoutes(app: FastifyInstance): void {
  app.get("/admin/settings/tokens", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return { admin_tokens: listPublicAdminTokens() };
  });

  app.post<{
    Body: { name?: string; token?: string; generate?: boolean };
  }>("/admin/settings/tokens", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const body = request.body ?? {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const token =
      body.generate === true
        ? generateAdminTokenValue()
        : typeof body.token === "string"
          ? body.token.trim()
          : "";
    try {
      const entry = addAdminToken(name, token);
      return {
        ok: true,
        token: entry,
        admin_tokens: listPublicAdminTokens(),
        note: "请将新 token 保存到客户端 x-admin-token；服务端仅返回一次明文 token。",
      };
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : "admin_token_create_failed",
      });
    }
  });

  app.delete<{ Params: { name: string } }>(
    "/admin/settings/tokens/:name",
    async (request, reply) => {
      if (!requireAdmin(request)) {
        return reply.status(401).send({ error: "unauthorized" });
      }
      try {
        removeAdminToken(request.params.name, getAdminActor(request));
        return { ok: true, admin_tokens: listPublicAdminTokens() };
      } catch (e) {
        return reply.status(400).send({
          error: e instanceof Error ? e.message : "admin_token_delete_failed",
        });
      }
    },
  );
}
