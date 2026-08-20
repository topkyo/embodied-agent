import type { FastifyInstance } from "fastify";
import { parseIntentPayload } from "@embodied-agent/core";
import { buildDomainPackOpsSchemaFromContract } from "@embodied-agent/runtime";
import { resolveOpsControlIntent } from "../../domain-packs/ops-control.js";
import { domainPackAdminRouteContext } from "../../domain-packs/admin-route-context.js";
import { getPrimaryDomainPackContract } from "../../domain-packs/loader.js";
import { getEffectiveSettings } from "../../settings/store.js";
import { loadRegistry } from "@embodied-agent/node";
import { requireAdmin } from "../admin-auth.js";
import { getPlatformRuntimeContext } from "../../runtime/context.js";

type DomainIntentBody = {
  intent?: unknown;
  confirmed?: boolean;
};

type DomainControlActionBody = {
  action_id?: string;
  confirmed?: boolean;
};

export function registerAdminDomainIntentRoutes(app: FastifyInstance): void {
  const context = domainPackAdminRouteContext(app.mqtt);

  app.post("/admin/domain/intents", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const body = request.body as DomainIntentBody;
    const settings = getEffectiveSettings();
    const schemas = getPrimaryDomainPackContract(getPlatformRuntimeContext().loader, settings).core
      .intentSchemas;
    let intent;
    try {
      intent = parseIntentPayload(body?.intent, schemas);
    } catch (error) {
      return reply.status(400).send({
        error: error instanceof Error ? error.message : "invalid_domain_intent",
      });
    }
    const confirmation = context.shouldRequireConfirmation(intent);
    if (confirmation.required && body?.confirmed !== true) {
      return reply.status(409).send({
        requires_confirmation: true,
        reason: confirmation.reason,
        summary: confirmation.summary,
      });
    }
    const routed = await context.routeIntent(intent, body?.confirmed === true);
    return reply.status(routed.status).send(routed.body);
  });

  app.post("/admin/domain/control-actions", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const body = request.body as DomainControlActionBody;
    const actionId = body?.action_id?.trim();
    if (!actionId) {
      return reply.status(400).send({ error: "missing_action_id" });
    }
    const settings = getEffectiveSettings();
    const activeDomain = settings.active_domain;
    if (!activeDomain) {
      return reply.status(400).send({ error: "active_domain_missing" });
    }
    const contract = getPrimaryDomainPackContract(getPlatformRuntimeContext().loader, settings);
    const schemaAction = buildDomainPackOpsSchemaFromContract(contract).control.actions.find(
      (action) => action.id === actionId,
    );
    if (!schemaAction) {
      return reply.status(404).send({ error: "control_action_not_found" });
    }
    let intent;
    try {
      intent = resolveOpsControlIntent(contract, schemaAction, {
        deployment_id: settings.deployment_id,
        domainConfig: settings.domain_configs?.[activeDomain],
        registry: loadRegistry(),
      });
    } catch (error) {
      return reply.status(400).send({
        error: error instanceof Error ? error.message : "control_action_unresolvable",
      });
    }
    const confirmation = context.shouldRequireConfirmation(intent);
    if (confirmation.required && body?.confirmed !== true) {
      return reply.status(409).send({
        requires_confirmation: true,
        reason: confirmation.reason,
        summary: confirmation.summary,
        intent,
      });
    }
    const routed = await context.routeIntent(intent, body?.confirmed === true);
    const payload =
      typeof routed.body === "object" && routed.body !== null
        ? { ...(routed.body as Record<string, unknown>), intent }
        : { reply: routed.body, intent };
    return reply.status(routed.status).send(payload);
  });
}
