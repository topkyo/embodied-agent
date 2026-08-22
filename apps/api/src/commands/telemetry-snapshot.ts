import { loadRegistry } from "@embodied-agent/node";
import { getTelemetry, type EntityTelemetry } from "../telemetry/store.js";

export type TelemetrySnapshot = {
  entity_id: string;
  captured_at: string;
  [key: string]: unknown;
};

export function entityIdFromDevice(deployment_id: string, device_id: string): string | undefined {
  const reg = loadRegistry();
  return reg.devices.find((d) => d.deployment_id === deployment_id && d.device_id === device_id)
    ?.entity_id;
}

export function captureTelemetrySnapshot(
  entity_id: string,
  deployment_id: string,
  at = new Date(),
): TelemetrySnapshot | undefined {
  const t = getTelemetry(entity_id, deployment_id);
  if (!t) return undefined;
  return toSnapshot(t, at);
}

function toSnapshot(t: EntityTelemetry, at: Date): TelemetrySnapshot {
  return {
    ...t,
    captured_at: at.toISOString(),
  };
}
