import type { AdminOverviewEntity } from "../api";

type DeviceReading = {
  device_type?: string;
  metric?: string;
  value?: unknown;
};

export function greenhouseMetricNumber(
  gh: AdminOverviewEntity | null,
  field: "temperature_c" | "humidity_percent",
): number | undefined {
  const value = gh?.telemetry?.[field];
  return typeof value === "number" ? value : undefined;
}

export function greenhouseMetricString(
  gh: AdminOverviewEntity | null,
  field: "vent_status" | "fan_status",
): string | undefined {
  const value = gh?.telemetry?.[field];
  if (typeof value === "string") return value;
  const deviceType = field === "vent_status" ? "vent_motor" : "fan";
  const readings = gh?.telemetry?.device_readings;
  if (!Array.isArray(readings)) return undefined;
  const reading = (readings as DeviceReading[]).find(
    (item) => item.device_type === deviceType && item.metric === "relay_state",
  );
  if (!reading || typeof reading.value !== "number") return undefined;
  if (field === "vent_status") return reading.value === 1 ? "open" : "closed";
  return reading.value === 1 ? "on" : "off";
}

export function hasGreenhouseTelemetry(gh: AdminOverviewEntity): boolean {
  return (
    gh.reported_at != null &&
    (greenhouseMetricNumber(gh, "temperature_c") != null ||
      greenhouseMetricNumber(gh, "humidity_percent") != null ||
      greenhouseMetricString(gh, "vent_status") != null ||
      greenhouseMetricString(gh, "fan_status") != null)
  );
}
