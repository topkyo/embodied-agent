import type { FastifyInstance } from "fastify";
import { getEffectiveSettings } from "../../settings/store.js";
import { requireOperator } from "../admin-auth.js";
import { listAlertRules } from "../../alerts/threshold-store.js";
import { getCommand, listCommands } from "../../commands/store.js";
import { listAllSchedules } from "../../report/schedule-store.js";
import { resolveAdminDeploymentId } from "../../fs/deployment-path.js";

/** 只读运维：alert-rules / report-schedules / commands；任意 web session（requireOperator）。 */
export function registerAdminOperationsRoutes(app: FastifyInstance): void {
  app.get<{
    Querystring: { limit?: string };
  }>("/admin/commands", async (request, reply) => {
    if (!requireOperator(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const rawLimit = Number.parseInt(request.query.limit ?? "50", 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
    const commands = [...listCommands()]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, limit);
    return { commands, count: commands.length };
  });

  app.get<{ Querystring: { deployment_id?: string } }>(
    "/admin/alert-rules",
    async (request, reply) => {
      if (!requireOperator(request)) {
        return reply.status(401).send({ error: "unauthorized" });
      }
      const settings = getEffectiveSettings();
      const resolved = resolveAdminDeploymentId(
        request.query.deployment_id,
        settings.deployment_id,
      );
      if ("error" in resolved) {
        return reply.status(400).send({ error: resolved.error });
      }
      const { deployment_id: deployment_id } = resolved;
      const rules = listAlertRules(deployment_id);
      return { deployment_id, rules, count: rules.length };
    },
  );

  app.get<{ Querystring: { deployment_id?: string } }>(
    "/admin/report-schedules",
    async (request, reply) => {
      if (!requireOperator(request)) {
        return reply.status(401).send({ error: "unauthorized" });
      }
      const settings = getEffectiveSettings();
      const resolved = resolveAdminDeploymentId(
        request.query.deployment_id,
        settings.deployment_id,
      );
      if ("error" in resolved) {
        return reply.status(400).send({ error: resolved.error });
      }
      const { deployment_id } = resolved;
      const schedules = listAllSchedules(deployment_id);
      return { deployment_id, schedules, count: schedules.length };
    },
  );

  app.get<{
    Params: { command_id: string };
  }>("/admin/commands/:command_id", async (request, reply) => {
    if (!requireOperator(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const commandId = request.params.command_id?.trim();
    if (!commandId) {
      return reply.status(400).send({ error: "missing_command_id" });
    }
    const record = getCommand(commandId);
    if (!record) {
      return reply.status(404).send({ error: "command_not_found" });
    }
    return record;
  });
}
