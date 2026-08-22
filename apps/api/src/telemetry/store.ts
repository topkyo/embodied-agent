import { ingestNodeGpsFromHeartbeat } from "../integrations/weather/node-gps.js";
import { loadRegistry } from "@embodied-agent/node";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { atomicWriteJson } from "@embodied-agent/platform";
import { currentDeploymentId, deploymentScopedPath } from "../fs/deployment-path.js";

export type EntityTelemetry = {
  entity_id: string;
  reported_at: string;
  device_readings?: EntityDeviceReading[];
  [key: string]: unknown;
};

export type EntityDeviceReading = {
  device_id: string;
  device_type?: string;
  default_for?: string;
  metric: string;
  value: number;
  reported_at: string;
};

type PersistedState = {
  deviceReadings: Array<{ device_id: string; metric: string; value: number; reported_at: string }>;
  cache: EntityTelemetry[];
  heartbeats: Array<{
    node_id: string;
    reported_at: string;
    config_version?: number;
  }>;
};

type TelemetryReading = { device_id?: unknown; metric?: unknown; value?: unknown };

export type UpsertTelemetryRow = {
  entity_id: string;
  [key: string]: unknown;
};

type RuntimeTelemetryState = {
  hydrated: boolean;
  deviceReadings: Map<
    string,
    { device_id: string; metric: string; value: number; reported_at: string }
  >;
  cache: Map<string, EntityTelemetry>;
  heartbeats: Map<string, { node_id: string; reported_at: string; config_version?: number }>;
};

const states = new Map<string, RuntimeTelemetryState>();

function statePath(deployment_id = currentDeploymentId()): string {
  return deploymentScopedPath("telemetry-state.json", deployment_id);
}

function emptyState(): RuntimeTelemetryState {
  return {
    hydrated: false,
    deviceReadings: new Map(),
    cache: new Map(),
    heartbeats: new Map(),
  };
}

function stateFor(deployment_id = currentDeploymentId()): RuntimeTelemetryState {
  let state = states.get(deployment_id);
  if (!state) {
    state = emptyState();
    states.set(deployment_id, state);
  }
  return state;
}

function hydrate(deployment_id = currentDeploymentId()): RuntimeTelemetryState {
  const runtime = stateFor(deployment_id);
  if (runtime.hydrated) return runtime;
  runtime.hydrated = true;
  const path = statePath(deployment_id);
  if (!existsSync(path)) return runtime;
  try {
    const state = JSON.parse(readFileSync(path, "utf8")) as PersistedState;
    runtime.deviceReadings.clear();
    runtime.cache.clear();
    runtime.heartbeats.clear();
    for (const r of state.deviceReadings || []) {
      runtime.deviceReadings.set(`${r.device_id}:${r.metric}`, r);
    }
    for (const t of state.cache || []) {
      if (!t.entity_id) {
        throw new Error("telemetry cache row missing entity_id");
      }
      runtime.cache.set(t.entity_id, t);
    }
    for (const h of state.heartbeats || []) {
      runtime.heartbeats.set(h.node_id, h);
    }
  } catch (e) {
    throw new Error(`${path} 无法读取或校验失败：${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
  return runtime;
}

function entityDeviceReadings(
  runtime: RuntimeTelemetryState,
  entity_id: string,
  deployment_id: string,
): EntityDeviceReading[] {
  if (runtime.deviceReadings.size === 0) return [];
  const registry = loadRegistry();
  const devices = registry.devices.filter(
    (device) => device.deployment_id === deployment_id && device.entity_id === entity_id,
  );
  return devices.flatMap((device) => {
    const rows = [...runtime.deviceReadings.values()].filter(
      (reading) => reading.device_id === device.device_id,
    );
    return rows.map((reading) => ({
      device_id: reading.device_id,
      device_type: device.device_type,
      default_for: device.default_for,
      metric: reading.metric,
      value: reading.value,
      reported_at: reading.reported_at,
    }));
  });
}

function publicTelemetry(
  runtime: RuntimeTelemetryState,
  row: EntityTelemetry,
  deployment_id: string,
): EntityTelemetry {
  return {
    ...row,
    device_readings: entityDeviceReadings(runtime, row.entity_id, deployment_id),
  };
}

function persist(deployment_id = currentDeploymentId()): void {
  const runtime = stateFor(deployment_id);
  const state: PersistedState = {
    deviceReadings: [...runtime.deviceReadings.values()],
    cache: [...runtime.cache.values()],
    heartbeats: [...runtime.heartbeats.values()],
  };
  atomicWriteJson(statePath(deployment_id), state);
}

export function upsertTelemetry(
  rows: UpsertTelemetryRow[],
  deployment_id = currentDeploymentId(),
): void {
  const runtime = hydrate(deployment_id);
  const now = new Date().toISOString();
  for (const row of rows) {
    runtime.cache.set(row.entity_id, { ...row, reported_at: now });
  }
  persist(deployment_id);
}

export function ingestTelemetryMessage(
  payload: unknown,
  deployment_id = currentDeploymentId(),
): boolean {
  if (!payload || typeof payload !== "object") return false;
  const runtime = hydrate(deployment_id);
  const raw = payload as Record<string, unknown>;
  const rows: UpsertTelemetryRow[] = [];
  const now = new Date().toISOString();

  // 新协议：按 device_id 的 readings（doc esp32-node-registration）
  if (Array.isArray(raw.readings)) {
    const reg = loadRegistry();
    const deviceToEntity = new Map<string, string>();
    for (const d of reg.devices) {
      if (d.deployment_id !== deployment_id) continue;
      if (d.entity_id && d.device_id) deviceToEntity.set(d.device_id, d.entity_id);
    }
    const entityAgg: Record<string, Record<string, number>> = {};
    for (const r of raw.readings as TelemetryReading[]) {
      if (!r || typeof r !== "object") continue;
      const devId = String(r.device_id ?? "");
      const metric = String(r.metric ?? "");
      const val = Number(r.value);
      if (!devId || !metric || !Number.isFinite(val)) continue;
      runtime.deviceReadings.set(`${devId}:${metric}`, {
        device_id: devId,
        metric,
        value: val,
        reported_at: now,
      });
      const entityId = deviceToEntity.get(devId);
      if (entityId) {
        if (!entityAgg[entityId]) entityAgg[entityId] = {};
        entityAgg[entityId][metric] = val;
      }
    }
    for (const [entityId, metrics] of Object.entries(entityAgg)) {
      const prev = runtime.cache.get(entityId);
      const preservedMetrics: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(prev ?? {})) {
        if (key === "entity_id" || key === "reported_at" || key === "device_readings") continue;
        if (typeof value === "number") preservedMetrics[key] = value;
      }
      rows.push({
        entity_id: entityId,
        ...preservedMetrics,
        ...metrics,
      });
    }
  }

  if (rows.length === 0) return false;
  upsertTelemetry(rows, deployment_id);
  persist(deployment_id); // ensure deviceReadings are saved too
  return true;
}

export function ingestHeartbeatMessage(
  payload: unknown,
  deployment_id = currentDeploymentId(),
): boolean {
  const runtime = hydrate(deployment_id);
  if (!payload || typeof payload !== "object") return false;
  const raw = payload as Record<string, unknown>;
  const node_id = String(raw.node_id ?? "");
  const reported_at = new Date().toISOString();

  if (node_id) {
    const config_version =
      typeof raw.config_version === "number" && Number.isFinite(raw.config_version)
        ? raw.config_version
        : undefined;
    runtime.heartbeats.set(node_id, { node_id, reported_at, config_version });
    ingestNodeGpsFromHeartbeat(raw);
    persist(deployment_id);
  }
  return !!node_id;
}

export function getTelemetry(
  entity_id: string,
  deployment_id = currentDeploymentId(),
): EntityTelemetry | undefined {
  const runtime = hydrate(deployment_id);
  const row = runtime.cache.get(entity_id);
  return row ? publicTelemetry(runtime, row, deployment_id) : undefined;
}

export function getAllTelemetry(deployment_id = currentDeploymentId()): EntityTelemetry[] {
  const runtime = hydrate(deployment_id);
  return [...runtime.cache.values()].map((row) => publicTelemetry(runtime, row, deployment_id));
}

/** 仅返回 MQTT/upsert 写入的缓存 */
export function getIngestedTelemetry(deployment_id = currentDeploymentId()): EntityTelemetry[] {
  return getAllTelemetry(deployment_id);
}

/** @internal tests */
export function resetTelemetryCacheForTests(deployment_id = currentDeploymentId()): void {
  states.delete(deployment_id);
  const path = statePath(deployment_id);
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      /* ignore */
    }
  }
}

export function getNodeHeartbeat(
  node_id: string,
  deployment_id = currentDeploymentId(),
): { node_id: string; reported_at: string; config_version?: number } | undefined {
  return hydrate(deployment_id).heartbeats.get(node_id);
}

export function getNodeHeartbeatConfigVersion(
  node_id: string,
  deployment_id = currentDeploymentId(),
): number | undefined {
  return getNodeHeartbeat(node_id, deployment_id)?.config_version;
}
