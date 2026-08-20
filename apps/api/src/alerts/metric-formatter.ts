import type { AlertMetricFormatter } from "./evaluator.js";

const METRIC_LABELS: Record<string, string> = {
  temperature_c: "温度",
  humidity_percent: "湿度",
};

export const domainAlertMetricFormatter: AlertMetricFormatter = {
  formatLabel: (metric) => METRIC_LABELS[metric] ?? metric,
  formatValue: (metric, value) => {
    if (metric === "temperature_c") return `${value}°C`;
    if (metric === "humidity_percent") return `${value}%`;
    return String(value);
  },
};
