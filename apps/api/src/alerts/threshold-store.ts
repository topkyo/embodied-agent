import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { currentDeploymentId, deploymentScopedPath } from "../fs/deployment-path.js";
import { atomicWriteJson } from "@embodied-agent/platform";

export type AlertRule = {
  entity_id: string;
  metric: string;
  operator: ">" | "<" | ">=" | "<=";
  value: number;
  enabled: boolean;
  updated_at: string;
  updated_by: string;
};

type RulesFile = { rules: AlertRule[] };

function rulesPath(deployment_id = currentDeploymentId()): string {
  return deploymentScopedPath("alert-rules.json", deployment_id);
}

function readRules(deployment_id = currentDeploymentId()): AlertRule[] {
  const path = rulesPath(deployment_id);
  if (!existsSync(path)) return [];
  try {
    const file = JSON.parse(readFileSync(path, "utf8")) as RulesFile;
    if (!Array.isArray(file.rules)) {
      throw new Error("rules must be an array");
    }
    return file.rules;
  } catch (e) {
    throw new Error(`${path} 无法读取或校验失败：${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}

function writeRules(rules: AlertRule[], deployment_id = currentDeploymentId()): void {
  const path = rulesPath(deployment_id);
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  atomicWriteJson(path, { rules });
}

export function listAlertRules(deployment_id = currentDeploymentId()): AlertRule[] {
  return readRules(deployment_id).filter((r) => r.enabled);
}

export function setAlertRule(
  rule: Omit<AlertRule, "updated_at" | "enabled"> & { enabled?: boolean },
  deployment_id = currentDeploymentId(),
): AlertRule {
  const rules = readRules(deployment_id);
  const idx = rules.findIndex((r) => r.entity_id === rule.entity_id && r.metric === rule.metric);
  const row: AlertRule = {
    ...rule,
    enabled: rule.enabled ?? true,
    updated_at: new Date().toISOString(),
  };
  if (idx >= 0) rules[idx] = row;
  else rules.push(row);
  writeRules(rules, deployment_id);
  return row;
}

export function removeAlertRulesForEntity(
  entity_id: string,
  deployment_id = currentDeploymentId(),
): void {
  writeRules(
    readRules(deployment_id).filter((r) => r.entity_id !== entity_id),
    deployment_id,
  );
}

export function removeAlertRule(
  entity_id: string,
  metric?: AlertRule["metric"],
  deployment_id = currentDeploymentId(),
): number {
  const rules = readRules(deployment_id);
  const before = rules.length;
  const next = rules.filter((r) => {
    if (r.entity_id !== entity_id) return true;
    if (metric && r.metric !== metric) return true;
    return false;
  });
  if (next.length !== before) writeRules(next, deployment_id);
  return before - next.length;
}

export function filterAlertRules(
  entity_id?: string,
  deployment_id = currentDeploymentId(),
): AlertRule[] {
  const rules = listAlertRules(deployment_id);
  if (!entity_id) return rules;
  return rules.filter((r) => r.entity_id === entity_id);
}

export function formatAlertRule(rule: AlertRule): string {
  const metricLabel =
    rule.metric === "temperature_c"
      ? "温度"
      : rule.metric === "humidity_percent"
        ? "湿度"
        : rule.metric;
  const unit =
    rule.metric === "temperature_c" ? "°C" : rule.metric === "humidity_percent" ? "%" : "";
  return `${rule.entity_id} ${metricLabel} ${rule.operator} ${rule.value}${unit}`;
}
