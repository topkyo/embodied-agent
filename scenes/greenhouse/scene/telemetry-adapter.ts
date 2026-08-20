import type { SceneTelemetrySlice } from "@embodied-agent/core";

export type GreenhouseTelemetry = {
  greenhouse_id: string;
  temperature_c: number;
  humidity_percent: number;
  vent_status?: string;
  fan_status?: string;
  [key: string]: unknown;
};

type DeviceReading = {
  device_type?: string;
  metric?: string;
  value?: unknown;
};

function numericField(
  slice: SceneTelemetrySlice,
  field: "temperature_c" | "humidity_percent",
): number {
  const value = slice[field];
  if (typeof value !== "number") {
    throw new Error(`greenhouse telemetry 缺少 ${field}：${slice.entity_id}`);
  }
  return value;
}

function directStatus(
  slice: SceneTelemetrySlice,
  field: "vent_status" | "fan_status",
): string | undefined {
  const value = slice[field];
  return typeof value === "string" ? value : undefined;
}

function relayStatusFromDeviceReadings(
  slice: SceneTelemetrySlice,
  deviceType: "vent_motor" | "fan",
): string | undefined {
  const readings = slice.device_readings;
  if (!Array.isArray(readings)) return undefined;
  const reading = (readings as DeviceReading[]).find(
    (item) => item.device_type === deviceType && item.metric === "relay_state",
  );
  if (!reading || typeof reading.value !== "number") return undefined;
  if (deviceType === "vent_motor") return reading.value === 1 ? "open" : "closed";
  return reading.value === 1 ? "on" : "off";
}

export function toGreenhouseTelemetry(slice: SceneTelemetrySlice): GreenhouseTelemetry {
  const greenhouse_id = slice.entity_id;
  return {
    ...slice,
    greenhouse_id,
    temperature_c: numericField(slice, "temperature_c"),
    humidity_percent: numericField(slice, "humidity_percent"),
    vent_status:
      directStatus(slice, "vent_status") ?? relayStatusFromDeviceReadings(slice, "vent_motor"),
    fan_status: directStatus(slice, "fan_status") ?? relayStatusFromDeviceReadings(slice, "fan"),
  };
}
