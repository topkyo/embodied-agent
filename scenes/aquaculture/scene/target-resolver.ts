import type {
  DeviceRegistry,
  IntentPayload,
  SceneResolvedDeviceTarget,
} from "@embodied-agent/core";

export function isAquaculturePhysicalControlSkill(_intent: IntentPayload): boolean {
  return false;
}

export function resolveAquacultureDeviceTarget(
  _intent: IntentPayload,
  _registry: DeviceRegistry,
): { ok: true; target: SceneResolvedDeviceTarget } | { ok: false; reason: string } {
  return { ok: false, reason: "aquaculture_pack_placeholder" };
}
