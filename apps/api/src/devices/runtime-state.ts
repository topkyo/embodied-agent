import type { DeviceRuntimeState } from "@embodied-agent/safety";
import { getRunningActionForDevice } from "../commands/store.js";
import type { SceneResolvedDeviceTarget } from "@embodied-agent/runtime";
import { getNodeHeartbeat } from "../telemetry/store.js";

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 90_000;

export function resolveDeviceRuntimeState(
  target: SceneResolvedDeviceTarget,
  now = Date.now(),
): DeviceRuntimeState {
  const heartbeat = getNodeHeartbeat(target.node_id, target.deployment_id);
  const heartbeatTimeoutMs = Number.parseInt(
    process.env.DEVICE_HEARTBEAT_TIMEOUT_MS ?? String(DEFAULT_HEARTBEAT_TIMEOUT_MS),
    10,
  );
  const effectiveTimeout =
    Number.isFinite(heartbeatTimeoutMs) && heartbeatTimeoutMs > 0
      ? heartbeatTimeoutMs
      : DEFAULT_HEARTBEAT_TIMEOUT_MS;
  const heartbeatOffline =
    heartbeat !== undefined && now - Date.parse(heartbeat.reported_at) > effectiveTimeout;

  return {
    device_id: target.device.device_id,
    status: heartbeatOffline ? "offline" : target.device.status,
    manual_override: target.device.manual_override ?? false,
    running_action: getRunningActionForDevice(target.device.device_id),
  };
}
