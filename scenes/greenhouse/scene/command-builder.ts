import type {
  DomainPackCommandPatch,
  IntentPayload,
  SceneResolvedDeviceTarget,
} from "@embodied-agent/core";

export function buildGreenhouseCommandPatch(
  intent: IntentPayload,
  target: SceneResolvedDeviceTarget,
): DomainPackCommandPatch | null {
  const params = intent.parameters as {
    duration_seconds?: number;
    mode?: string;
    max_temp_c?: number;
    temp_high_c?: number;
    temp_low_c?: number;
    until_iso?: string;
  };
  if (intent.skill === "greenhouse.open_vent") {
    return {
      action: "open",
      parameters: { duration_seconds: params.duration_seconds },
    };
  }
  if (intent.skill === "greenhouse.close_vent") {
    return {
      action: "close",
      parameters: { duration_seconds: params.duration_seconds },
    };
  }
  if (intent.skill === "greenhouse.stop_vent") {
    return { action: "stop" };
  }
  if (intent.skill === "greenhouse.set_mode") {
    const p = params;
    return {
      action: "set_mode",
      parameters: {
        mode: p.mode,
        max_temp_c: p.max_temp_c,
        temp_high_c: p.temp_high_c,
        temp_low_c: p.temp_low_c,
        until_iso: p.until_iso,
      },
    };
  }
  if (intent.skill === "fan.start") {
    const duration = intent.parameters?.duration_seconds;
    if (!duration) return null;
    return {
      action: "start",
      parameters: { duration_seconds: duration },
    };
  }
  if (intent.skill === "fan.stop") {
    return { action: "stop" };
  }
  if (intent.skill === "irrigation.start") {
    return {
      device_type: target.device.device_type || "irrigation_valve",
      action: "start",
      parameters: { duration_seconds: params.duration_seconds },
    };
  }
  if (intent.skill === "irrigation.stop") {
    return {
      device_type: target.device.device_type || "irrigation_valve",
      action: "stop",
    };
  }
  return null;
}
