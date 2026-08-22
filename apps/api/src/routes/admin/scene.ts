import type { FastifyInstance } from "fastify";
import { getEffectiveSettings } from "../../settings/store.js";
import { requireAdmin } from "../admin-auth.js";
import {
  aggregateSceneOutcomesAllDeployments,
  listSceneOutcomes,
} from "../../scene/outcome-store.js";
import { getPilotBaseline, savePilotBaseline } from "../../scene/pilot-baseline.js";
import { buildPilotRoiSummary } from "../../scene/roi-report.js";
import {
  applyPolicySuggestion,
  dismissPolicySuggestion,
  generatePolicySuggestions,
  listPolicySuggestions,
} from "../../scene/policy-suggestions.js";

export function registerAdminSceneRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { since_days?: string } }>(
    "/admin/scene-outcomes/all",
    async (request, reply) => {
      if (!requireAdmin(request)) {
        return reply.status(401).send({ error: "unauthorized" });
      }
      const since_days = Number(request.query.since_days ?? "7");
      try {
        const deployment_ids = [getEffectiveSettings().deployment_id];
        return aggregateSceneOutcomesAllDeployments(
          deployment_ids,
          Number.isFinite(since_days) ? since_days : 7,
        );
      } catch (e) {
        return reply.status(500).send({
          error: "registry_unavailable",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    },
  );

  app.get<{ Querystring: { since_days?: string } }>("/admin/pilot/roi", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const settings = getEffectiveSettings();
    const since_days = Number(request.query.since_days ?? "7");
    return buildPilotRoiSummary(
      settings.deployment_id,
      Number.isFinite(since_days) ? since_days : 7,
    );
  });

  app.get("/admin/policy-suggestions", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const settings = getEffectiveSettings();
    generatePolicySuggestions(settings.deployment_id);
    return {
      deployment_id: settings.deployment_id,
      suggestions: listPolicySuggestions(settings.deployment_id),
    };
  });

  app.post<{ Params: { id: string } }>(
    "/admin/policy-suggestions/:id/apply",
    async (request, reply) => {
      if (!requireAdmin(request)) {
        return reply.status(401).send({ error: "unauthorized" });
      }
      const settings = getEffectiveSettings();
      const result = applyPolicySuggestion(settings.deployment_id, request.params.id, "admin");
      if (!result.ok) {
        return reply.status(400).send({ error: result.error });
      }
      return { ok: true, suggestion: result.suggestion };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/admin/policy-suggestions/:id/dismiss",
    async (request, reply) => {
      if (!requireAdmin(request)) {
        return reply.status(401).send({ error: "unauthorized" });
      }
      const settings = getEffectiveSettings();
      const row = dismissPolicySuggestion(settings.deployment_id, request.params.id);
      if (!row) {
        return reply.status(404).send({ error: "not_found" });
      }
      return { ok: true, suggestion: row };
    },
  );

  app.get<{ Querystring: { limit?: string; since_days?: string } }>(
    "/admin/scene-outcomes",
    async (request, reply) => {
      if (!requireAdmin(request)) {
        return reply.status(401).send({ error: "unauthorized" });
      }
      const settings = getEffectiveSettings();
      const limit = Number(request.query.limit ?? "50");
      const since_days = Number(request.query.since_days ?? "7");
      return {
        deployment_id: settings.deployment_id,
        outcomes: listSceneOutcomes(settings.deployment_id, {
          limit: Number.isFinite(limit) ? limit : 50,
          since_days: Number.isFinite(since_days) ? since_days : 7,
        }),
      };
    },
  );

  app.get("/admin/pilot/baseline", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const settings = getEffectiveSettings();
    return {
      deployment_id: settings.deployment_id,
      baseline: getPilotBaseline(settings.deployment_id),
    };
  });

  app.post<{
    Body: { manual_run_shed_count_per_week?: number; notes?: string };
  }>("/admin/pilot/baseline", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const settings = getEffectiveSettings();
    const body = request.body ?? {};
    const baseline = savePilotBaseline(settings.deployment_id, {
      manual_run_shed_count_per_week: body.manual_run_shed_count_per_week,
      notes: body.notes,
    });
    return { ok: true, baseline };
  });
}
