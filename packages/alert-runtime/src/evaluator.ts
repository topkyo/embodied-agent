import type { AlertRule, EntityTelemetrySnapshot } from "./types.js";

export type AlertMetricFormatter = {
  formatLabel(metric: string): string;
  formatValue(metric: string, value: number): string;
};

export const defaultAlertMetricFormatter: AlertMetricFormatter = {
  formatLabel: (metric) => metric,
  formatValue: (_metric, value) => String(value),
};

export function metricValue(
  telemetry: EntityTelemetrySnapshot,
  metric: AlertRule["metric"],
): number {
  const value = telemetry[metric];
  if (typeof value === "number") return value;
  throw new Error(`unsupported alert metric for current telemetry adapter: ${metric}`);
}

export function metricBreaches(
  value: number,
  operator: AlertRule["operator"],
  threshold: number,
): boolean {
  switch (operator) {
    case ">":
      return value > threshold;
    case ">=":
      return value >= threshold;
    case "<":
      return value < threshold;
    case "<=":
      return value <= threshold;
    default:
      return false;
  }
}

export function buildAlertMessage(
  rule: AlertRule,
  telemetry: EntityTelemetrySnapshot,
  formatter: AlertMetricFormatter = defaultAlertMetricFormatter,
): string {
  const current = metricValue(telemetry, rule.metric);
  const label = formatter.formatLabel(rule.metric);
  return (
    `【报警】${rule.entity_id} ${label} ${formatter.formatValue(rule.metric, current)}，` +
    `已触发您设置的 ${rule.operator}${formatter.formatValue(rule.metric, rule.value)} 条件。`
  );
}

export function ruleKey(rule: AlertRule): string {
  return `${rule.entity_id}:${rule.metric}:${rule.operator}:${rule.value}`;
}
