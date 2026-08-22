import {
  buildAlertMessage as runtimeBuildAlertMessage,
  metricBreaches,
  metricValue,
  ruleKey,
} from "@embodied-agent/alert-runtime";

export type AlertMetricFormatter = {
  formatLabel(metric: string): string;
  formatValue(metric: string, value: number): string;
};

export const defaultAlertMetricFormatter: AlertMetricFormatter = {
  formatLabel: (metric) => metric,
  formatValue: (_metric, value) => String(value),
};

export { metricBreaches, metricValue, ruleKey };

type AlertRuleLike = {
  entity_id: string;
  metric: string;
  operator: string;
  value: number;
};

type EntityTelemetryLike = {
  entity_id: string;
  reported_at?: string;
  [key: string]: unknown;
};

const buildAlertMessageRuntime = runtimeBuildAlertMessage as unknown as (
  rule: AlertRuleLike,
  telemetry: EntityTelemetryLike,
  formatter?: AlertMetricFormatter,
) => string;

export function buildAlertMessage(
  rule: AlertRuleLike,
  telemetry: EntityTelemetryLike,
  formatter: AlertMetricFormatter = defaultAlertMetricFormatter,
): string {
  return buildAlertMessageRuntime(rule, telemetry, formatter);
}
