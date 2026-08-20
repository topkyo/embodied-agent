export type GreenhouseMetric = "temperature_c" | "humidity_percent";

export function formatGreenhouseLabel(id: string): string {
  if (id === "gh-001") return "1号棚";
  if (id === "gh-002") return "2号棚";
  return id;
}

export function formatGreenhouseMetricValue(metric: GreenhouseMetric, value: number): string {
  return metric === "temperature_c" ? `${value}°C` : `${value}%`;
}

export function formatGreenhouseMetricLabel(metric: GreenhouseMetric): string {
  return metric === "temperature_c" ? "温度" : "湿度";
}
