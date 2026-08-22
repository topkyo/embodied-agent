import type { FastifyInstance } from "fastify";
import {
  buildDomainPackOpsSchemaFromContract,
  domainPackCapabilitiesFromContract,
  evaluateDomainPackReadinessFromContract,
} from "@embodied-agent/runtime";
import { requireAdmin, requireOperator } from "../admin-auth.js";
import {
  getDomainPackCatalog,
  resolveActiveDomainPackContracts,
} from "../../domain-packs/loader.js";
import {
  evaluateDomainPackRuntimeReadiness,
  evaluateSimMatrixReportEvidence,
} from "@embodied-agent/runtime";
import { listNodes } from "@embodied-agent/node";
import { getNodeRuntimeStatus } from "../../nodes/online-status.js";
import { countAllPendingConfirms } from "../../policy/pending-confirm.js";
import { loadRegistry } from "@embodied-agent/node";
import { getEffectiveSettings } from "../../settings/store.js";
import { getPlatformRuntimeContext } from "../../runtime/context.js";

export function registerAdminDomainPacksRoutes(app: FastifyInstance): void {
  app.get("/admin/domain-packs", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const settings = getEffectiveSettings();
    const activeId = settings.active_domain;
    let activeContracts: ReturnType<typeof resolveActiveDomainPackContracts>;
    let activeError: string | null = null;
    try {
      activeContracts = resolveActiveDomainPackContracts(
        getPlatformRuntimeContext().loader,
        settings,
      );
    } catch (e) {
      activeContracts = [];
      activeError = e instanceof Error ? e.message : String(e);
    }
    const activeContract = activeContracts[0] ?? null;
    const activeReadiness = activeContract
      ? evaluateDomainPackReadinessFromContract(getPlatformRuntimeContext(), activeContract)
      : null;
    const activeOpsSchema = activeContract
      ? buildDomainPackOpsSchemaFromContract(activeContract)
      : null;
    const catalog = getDomainPackCatalog(getPlatformRuntimeContext().loader).map((entry) => {
      return {
        id: entry.id,
        display_name: entry.displayName,
        web_slug: entry.webSlug,
        status: entry.status,
        active: activeId === entry.id,
        ...(activeId === entry.id && activeContract && activeReadiness
          ? {
              capabilities: domainPackCapabilitiesFromContract(activeContract),
              readiness: activeReadiness,
              ops_schema: activeOpsSchema,
            }
          : {}),
      };
    });
    return {
      catalog,
      active_domain: settings.active_domain,
      deployment_id: settings.deployment_id,
      primary_pack_id: activeContracts[0]?.core.manifest.id ?? null,
      active_ops_schema: activeOpsSchema,
      active_error: activeError,
    };
  });

  app.get("/admin/platform/readiness", async (request, reply) => {
    if (!requireOperator(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const settings = getEffectiveSettings();
    const activeDomain = settings.active_domain ?? "";
    let activeContract: ReturnType<typeof resolveActiveDomainPackContracts>[number] | null;
    let activeReadiness: ReturnType<typeof evaluateDomainPackReadinessFromContract> | null;
    try {
      activeContract =
        resolveActiveDomainPackContracts(getPlatformRuntimeContext().loader, settings)[0] ?? null;
      activeReadiness = activeContract
        ? evaluateDomainPackReadinessFromContract(getPlatformRuntimeContext(), activeContract)
        : null;
    } catch {
      activeContract = null;
      activeReadiness = null;
    }
    const mqttPublisher = app.mqtt.publisher.status();
    let registryOk = true;
    let registryError: string | undefined;
    let deployments = 0;
    let entities = 0;
    let registry: ReturnType<typeof loadRegistry> | undefined;
    try {
      registry = loadRegistry();
      deployments = registry.deployments.length;
      entities = registry.entities.length;
    } catch (e) {
      registryOk = false;
      registryError = e instanceof Error ? e.message : String(e);
    }
    const now = Date.now();
    const nodes = listNodes(settings.deployment_id);
    const onlineNodes = nodes.filter(
      (node) => getNodeRuntimeStatus(node.node_id, now, settings.deployment_id).online,
    );
    const runtime =
      activeContract && registry
        ? await evaluateDomainPackRuntimeReadiness({
            contract: activeContract,
            deployment_id: settings.deployment_id,
            domainConfig: settings.domain_configs?.[activeDomain],
            registry,
            onlineNodeIds: onlineNodes.map((node) => node.node_id),
            mqttConnected: mqttPublisher?.connected ?? null,
          })
        : { checks: [], issues: [], ready: false };
    const reports =
      activeReadiness && activeContract
        ? evaluateSimMatrixReportEvidence({
            packId: activeReadiness.pack_id,
            deploymentId: settings.deployment_id,
            activeDomain,
            evalPaths: activeContract.core.eval,
            llmProvider: settings.llm_provider,
            llmBaseUrl: process.env.LLM_BASE_URL ?? settings.llm_base_url,
            model: process.env.LLM_MODEL ?? settings.llm_model,
            llmThinking:
              process.env.LLM_THINKING === undefined
                ? settings.llm_thinking
                : process.env.LLM_THINKING !== "0",
            domainConfig: settings.domain_configs?.[activeDomain],
            evidenceSecret: process.env.EVAL_EVIDENCE_SECRET,
          })
        : [];
    const mqttRequired = Boolean(
      activeContract?.core.readiness?.requiredTransports?.includes("mqtt"),
    );
    const checks = [
      {
        id: "active_domain",
        ok: Boolean(activeReadiness?.deliverable),
        label: "Active Domain Pack",
        detail: activeReadiness
          ? `${activeReadiness.pack_id}: ${activeReadiness.readiness}`
          : `未知 active_domain: ${activeDomain}`,
        severity: "error" as const,
      },
      {
        id: "llm",
        ok: Boolean(settings.llm_api_key),
        label: "LLM",
        detail: settings.llm_api_key ? settings.llm_model : "未配置 LLM API Key",
        severity: "error" as const,
      },
      ...(mqttRequired
        ? [
            {
              id: "mqtt",
              ok: mqttPublisher?.connected === true,
              label: "MQTT Publisher",
              detail:
                mqttPublisher?.connected === true
                  ? settings.mqtt_url
                  : "publisher 未连接或未初始化",
              severity: "warning" as const,
            },
          ]
        : []),
      {
        id: "registry",
        ok: registryOk && deployments > 0,
        label: "Registry",
        detail: registryOk
          ? `${deployments} deployments, ${entities} entities`
          : (registryError ?? "registry_unavailable"),
        severity: "error" as const,
      },
      {
        id: "nodes",
        ok: nodes.length > 0 && onlineNodes.length > 0,
        label: "Nodes",
        detail: `${onlineNodes.length}/${nodes.length} online`,
        severity: "error" as const,
      },
      ...runtime.checks,
      ...reports.map((report) => ({
        id: `sim_matrix_${report.slice}`,
        ok: report.ok,
        label: `Sim Matrix ${report.slice}`,
        detail: report.detail,
        severity: "error" as const,
      })),
    ];
    return {
      ready:
        Boolean(activeReadiness?.deliverable) &&
        runtime.ready &&
        checks.every((check) => check.ok || check.severity !== "error"),
      generated_at: new Date().toISOString(),
      deployment_id: settings.deployment_id,
      active_domain: activeDomain,
      checks,
      runtime_issues: runtime.issues,
      reports,
      packs: activeReadiness ? [activeReadiness] : [],
      pending_confirms_count: countAllPendingConfirms(),
    };
  });
}
