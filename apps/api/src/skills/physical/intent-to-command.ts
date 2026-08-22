import type { CommandMessage, IntentPayload } from "@embodied-agent/core";
import { commandDeliveryTtlMs } from "../../commands/config.js";
import { buildDomainCommandPatch, type SceneResolvedDeviceTarget } from "@embodied-agent/runtime";
import type { RouteContext } from "../route-context.js";
import { getPlatformRuntimeContext } from "../../runtime/context.js";

export function intentToCommand(
  intent: IntentPayload,
  ctx: RouteContext,
  target: SceneResolvedDeviceTarget,
): CommandMessage | null {
  if (!ctx.conversation_id?.trim()) return null;
  const now = new Date();
  const expires = new Date(now.getTime() + commandDeliveryTtlMs());
  const mutableIntent = intent as IntentPayload & { intent_id?: string };
  if (!mutableIntent.intent_id) {
    mutableIntent.intent_id = `intent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  const base: CommandMessage = {
    message_type: "command",
    protocol_version: "0.1",
    command_id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    intent_id: mutableIntent.intent_id,
    idempotency_key: `${target.deployment_id}:${ctx.user_id}:${intent.skill}:${target.device.device_id}:${now.toISOString()}`,
    deployment_id: target.deployment_id,
    entity_id: target.device.entity_id,
    node_id: target.node_id,
    device_id: target.device.device_id,
    device_type: target.device.device_type,
    action: "stop",
    issued_by: {
      user_id: ctx.user_id,
      role: ctx.role,
      platform: ctx.platform ?? "dev",
      conversation_id: ctx.conversation_id.trim(),
    },
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  };
  if (typeof target.config_version === "number") {
    base.config_version = target.config_version;
  }

  const patch = buildDomainCommandPatch(getPlatformRuntimeContext(), intent, target);
  if (!patch) return null;
  return {
    ...base,
    ...patch,
    device_type: patch.device_type ?? base.device_type,
  };
}
