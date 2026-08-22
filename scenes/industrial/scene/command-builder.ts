import type {
  DomainPackCommandPatch,
  IntentPayload,
  SceneResolvedDeviceTarget,
} from "@embodied-agent/core";

export function buildIndustrialCommandPatch(
  intent: IntentPayload,
  target: SceneResolvedDeviceTarget,
): DomainPackCommandPatch | null {
  const params = intent.parameters as { duration_seconds?: number };
  if (intent.skill === "industrial.start_exhaust") {
    return {
      device_type: target.device.device_type,
      action: "start",
      parameters: { duration_seconds: params.duration_seconds },
    };
  }
  if (intent.skill === "industrial.stop_exhaust") {
    return {
      device_type: target.device.device_type,
      action: "stop",
    };
  }
  return null;
}
