import { isNodeOffline, shouldSkipThresholdAlertForEntity } from "../alerts/node-offline.js";
import {
  getIngestedTelemetry,
  getNodeHeartbeat,
  getNodeHeartbeatConfigVersion,
} from "../telemetry/store.js";
import { getNodeAppliedConfigVersion, registryConfigVersion } from "@embodied-agent/node";
import type { DomainPackRuntimeReadinessCheck } from "@embodied-agent/core";
import { getPrimaryDomainPackContract } from "../domain-packs/loader.js";
import { loadRegistry } from "@embodied-agent/node";
import { getEffectiveSettings } from "../settings/store.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";

export type FlywheelNodeStatus = {
  node_id: string;
  online: boolean;
  reported_at: string | null;
  registry_config_version: number | null;
  applied_config_version: number | null;
  config_ready: boolean;
};

export type FlywheelReadyStatus = {
  ready: boolean;
  entities: string[];
  telemetry_ready: boolean;
  nodes_online: boolean;
  config_ready: boolean;
  checks: DomainPackRuntimeReadinessCheck[];
  nodes: FlywheelNodeStatus[];
};

export async function assessFlywheelReady(now = Date.now()): Promise<FlywheelReadyStatus> {
  const settings = getEffectiveSettings();
  const readiness = getPrimaryDomainPackContract(getPlatformRuntimeContext().loader, settings).core
    .readiness;
  const registry = loadRegistry();
  const activeDomain = settings.active_domain;
  const domainConfig = activeDomain ? settings.domain_configs?.[activeDomain] : undefined;
  const spec =
    readiness?.resolveFlywheel?.({
      deployment_id: settings.deployment_id,
      domainConfig,
      registry,
    }) ?? readiness?.flywheel;
  if (!spec) {
    throw new Error(
      `/dev/flywheel/ready 需要 active Domain Pack 显式声明 runtimeReadiness.flywheel 或 resolveFlywheel，当前 active_domain=${settings.active_domain || "(empty)"}`,
    );
  }
  const deploymentId = settings.deployment_id;
  const telemetry = getIngestedTelemetry(deploymentId);
  const entities = [
    ...new Set(
      spec.requiredTelemetry
        .filter((required) =>
          telemetry.some(
            (t) => t.entity_id === required.entity_id && Number.isFinite(t[required.metric]),
          ),
        )
        .map((required) => required.entity_id),
    ),
  ];
  const telemetry_ready = spec.requiredTelemetry.every((required) =>
    entities.includes(required.entity_id),
  );

  const nodes: FlywheelNodeStatus[] = spec.requiredNodes.map((node_id) => {
    const hb = getNodeHeartbeat(node_id, deploymentId);
    const online = Boolean(hb && !isNodeOffline(node_id, now, deploymentId));
    const registryCv = registryConfigVersion(deploymentId, node_id);
    const appliedCv =
      getNodeAppliedConfigVersion(deploymentId, node_id) ??
      getNodeHeartbeatConfigVersion(node_id, deploymentId);
    return {
      node_id,
      online,
      reported_at: hb?.reported_at ?? null,
      registry_config_version: registryCv ?? null,
      applied_config_version: appliedCv ?? null,
      config_ready: registryCv !== undefined && appliedCv === registryCv,
    };
  });
  const nodes_online = nodes.every((n) => n.online);
  const config_ready = nodes.every((n) => n.config_ready);
  const platformChecks: DomainPackRuntimeReadinessCheck[] = [
    {
      id: "flywheel_telemetry",
      ok: telemetry_ready,
      label: "Flywheel Telemetry",
      detail: telemetry_ready ? "required telemetry observed" : "required telemetry not observed",
      severity: "error",
    },
    {
      id: "flywheel_nodes_online",
      ok: nodes_online,
      label: "Flywheel Nodes",
      detail: nodes_online ? "required nodes online" : "required nodes not online",
      severity: "error",
    },
    {
      id: "flywheel_config_applied",
      ok: config_ready,
      label: "Flywheel Config",
      detail: config_ready
        ? "required nodes applied registry config"
        : "required nodes have not applied registry config",
      severity: "error",
    },
  ];

  const packChecks = await spec.probe?.({
    deployment_id: deploymentId,
    now,
    services: {
      isSustainedAlertReady: (entityId) =>
        !shouldSkipThresholdAlertForEntity(entityId, now, deploymentId),
    },
  });
  const checks = [...platformChecks, ...(packChecks ?? [])];
  const checksReady = checks.every((check) => check.ok || check.severity !== "error");

  return {
    ready: checksReady,
    entities,
    telemetry_ready,
    nodes_online,
    config_ready,
    checks,
    nodes,
  };
}
