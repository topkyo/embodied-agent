import type { FastifyInstance } from "fastify";
import type { UserRole } from "@embodied-agent/safety";
import { requireAdmin } from "../admin-auth.js";
import { deleteUser, listUsers, upsertUser, type UserRecord } from "../../auth/user-store.js";
import { invalidateUsersCache } from "../../auth/users.js";

export function registerAdminUsersRoutes(app: FastifyInstance): void {
  app.get("/admin/users", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return { users: listUsers() };
  });

  app.post<{ Body: UserRecord }>("/admin/users", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    try {
      const user = await upsertUser(request.body);
      invalidateUsersCache();
      return { ok: true, user };
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : "user_upsert_failed",
      });
    }
  });

  app.put<{
    Params: { user_id: string };
    Body: Partial<UserRecord> & { role?: UserRole };
  }>("/admin/users/:user_id", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const existing = listUsers().find((u) => u.user_id === request.params.user_id);
    if (!existing) {
      return reply.status(404).send({ error: "user_not_found" });
    }
    try {
      const body = request.body ?? {};
      const user = await upsertUser({
        user_id: existing.user_id,
        role: body.role ?? existing.role,
        deployment_id: body.deployment_id ?? existing.deployment_id,
        display_name: body.display_name ?? existing.display_name,
      });
      invalidateUsersCache();
      return { ok: true, user };
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : "user_update_failed",
      });
    }
  });

  app.delete<{ Params: { user_id: string } }>("/admin/users/:user_id", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    try {
      const ok = await deleteUser(request.params.user_id);
      if (!ok) {
        return reply.status(404).send({ error: "user_not_found" });
      }
      invalidateUsersCache();
      return { ok: true };
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : "user_delete_failed",
      });
    }
  });
}
