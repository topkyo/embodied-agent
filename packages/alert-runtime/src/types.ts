export type AlertMetricOperator = ">" | "<" | ">=" | "<=";

export type AlertRule = {
  entity_id: string;
  metric: string;
  operator: AlertMetricOperator;
  value: number;
  enabled: boolean;
  updated_at: string;
  updated_by: string;
};

export type EntityTelemetrySnapshot = {
  entity_id: string;
  reported_at?: string;
  [key: string]: unknown;
};
