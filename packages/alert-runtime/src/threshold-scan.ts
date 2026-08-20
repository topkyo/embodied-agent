import {
  buildAlertMessage,
  metricBreaches,
  metricValue,
  ruleKey,
  type AlertMetricFormatter,
} from "./evaluator.js";
import type { AlertRule, EntityTelemetrySnapshot } from "./types.js";

export type ThresholdBreachEvaluation = {
  value: number;
  breaching: boolean;
  message: string;
};

export function thresholdAlertKey(deploymentId: string, rule: AlertRule): string {
  return `${deploymentId}:${ruleKey(rule)}`;
}

export function evaluateThresholdBreach(
  rule: AlertRule,
  telemetry: EntityTelemetrySnapshot | undefined,
  formatter?: AlertMetricFormatter,
): ThresholdBreachEvaluation | null {
  if (!telemetry) return null;
  const value = metricValue(telemetry, rule.metric);
  const breaching = metricBreaches(value, rule.operator, rule.value);
  return {
    value,
    breaching,
    message: buildAlertMessage(rule, telemetry, formatter),
  };
}
