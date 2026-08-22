import type {
  DeviceRegistry,
  DomainPackContract,
  DomainPackReadinessIssue,
} from "@embodied-agent/core";
import { issue } from "./readiness-utils.js";

type RuntimeCheck = {
  id: string;
  ok: boolean;
  label: string;
  detail: string;
  severity: "error" | "warning";
};

export function collectDomainPackTransportIssues(
  contract: DomainPackContract,
  transportStates: Record<string, boolean | null>,
): DomainPackReadinessIssue[] {
  const readiness = contract.core.readiness;
  if (!readiness) return [];
  const issues: DomainPackReadinessIssue[] = [];
  const requiredTransports = readiness.requiredTransports ?? [];
  const hasProbe = typeof readiness.probe === "function";
  for (const transport of requiredTransports) {
    const state = transportStates[transport];
    if (state === undefined) {
      // mqtt 由平台 mqttConnected 注入；其它 transport（如 m20_http）连接态由 probe 覆盖。
      if (transport !== "mqtt" && hasProbe) {
        continue;
      }
      issues.push(
        issue(
          "unknown_required_transport",
          `未知 required transport：${transport}（未提供连接态）`,
        ),
      );
    } else if (state !== true) {
      issues.push(
        issue(
          `${transport}_transport_unavailable`,
          `active Domain Pack 要求 ${transport} transport 已连接`,
        ),
      );
    }
  }
  return issues;
}

export function collectDomainPackConfigRegistryIssues(opts: {
  contract: DomainPackContract;
  deployment_id: string;
  domainConfig?: unknown;
  registry: DeviceRegistry;
}): DomainPackReadinessIssue[] {
  const { contract, deployment_id, domainConfig, registry } = opts;
  const readiness = contract.core.readiness;
  if (!readiness) {
    return [
      issue(
        "runtime_readiness_missing",
        "live Domain Pack 必须声明 runtimeReadiness，不能跳过部署态校验。",
      ),
    ];
  }
  const context = { deployment_id, domainConfig, registry };
  return [
    ...(readiness.validateConfig?.(context) ?? []),
    ...(readiness.validateRegistry?.(context) ?? []),
  ];
}

export async function evaluateDomainPackRuntimeReadiness(opts: {
  contract: DomainPackContract;
  deployment_id: string;
  domainConfig?: unknown;
  registry: DeviceRegistry;
  onlineNodeIds?: readonly string[];
  mqttConnected?: boolean | null;
  transportStates?: Record<string, boolean | null>;
}): Promise<{ checks: RuntimeCheck[]; issues: DomainPackReadinessIssue[]; ready: boolean }> {
  const {
    contract,
    deployment_id,
    domainConfig,
    registry,
    onlineNodeIds,
    mqttConnected,
    transportStates,
  } = opts;
  const readiness = contract.core.readiness;
  const issues: DomainPackReadinessIssue[] = [];
  const checks: RuntimeCheck[] = [];
  const context = { deployment_id, domainConfig, registry, onlineNodeIds };

  if (!readiness) {
    issues.push(
      issue(
        "runtime_readiness_missing",
        "live Domain Pack 必须声明 runtimeReadiness，不能跳过部署态校验。",
      ),
    );
    checks.push({
      id: "runtime_readiness",
      ok: false,
      label: "Runtime Readiness",
      detail: "active Domain Pack 未声明 runtimeReadiness",
      severity: "error",
    });
    return { checks, issues, ready: false };
  }

  const configIssues = readiness.validateConfig?.(context) ?? [];
  const registryIssues = readiness.validateRegistry?.(context) ?? [];
  issues.push(...configIssues, ...registryIssues);
  checks.push({
    id: "domain_config",
    ok: !configIssues.some((item) => item.severity === "error"),
    label: "Domain Config",
    detail: configIssues.length === 0 ? "配置满足 active Domain Pack" : configIssues[0]!.message,
    severity: "error",
  });
  checks.push({
    id: "domain_registry",
    ok: !registryIssues.some((item) => item.severity === "error"),
    label: "Domain Registry",
    detail:
      registryIssues.length === 0 ? "registry 满足 active Domain Pack" : registryIssues[0]!.message,
    severity: "error",
  });

  const resolvedTransportStates: Record<string, boolean | null> = { ...(transportStates ?? {}) };
  if (mqttConnected !== undefined && resolvedTransportStates.mqtt === undefined) {
    resolvedTransportStates.mqtt = mqttConnected;
  }
  const transportIssues = collectDomainPackTransportIssues(contract, resolvedTransportStates);
  issues.push(...transportIssues);
  for (const transportIssue of transportIssues) {
    checks.push({
      id: transportIssue.code.endsWith("_transport_unavailable")
        ? transportIssue.code.replace("_transport_unavailable", "_transport")
        : `transport_${transportIssue.code}`,
      ok: false,
      label: "Transport",
      detail: transportIssue.message,
      severity: "error",
    });
  }
  const probeChecks = await readiness.probe?.(context);
  if (probeChecks) checks.push(...probeChecks);

  return {
    checks,
    issues,
    ready:
      issues.every((item) => item.severity !== "error") &&
      checks.every((check) => check.ok || check.severity !== "error"),
  };
}
