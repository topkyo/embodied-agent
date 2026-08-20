import type { CommandMessage, SceneResolvedDeviceTarget } from "@embodied-agent/core";
import { getConfiguredRuntimeSettings } from "./loader.js";
import type { PlatformRuntimeContext } from "./context.js";

export type DispatchabilityResult =
  { ok: true } | { ok: false; status: 403 | 503; reason: string; code: string };

export function assertDispatchableTarget(
  ctx: PlatformRuntimeContext,
  target: SceneResolvedDeviceTarget,
): DispatchabilityResult {
  const settings = getConfiguredRuntimeSettings(ctx.loader);
  const getNodeRuntimeStatus = ctx.services.getNodeRuntimeStatus();
  const loadRegistry = ctx.services.getLoadRegistry();
  if (target.deployment_id !== settings.deployment_id) {
    return {
      ok: false,
      status: 403,
      code: "deployment_mismatch",
      reason: "目标设备不属于当前部署，指令未下发。",
    };
  }

  const registry = loadRegistry();
  const deployment = registry.deployments.find(
    (item) => item.deployment_id === settings.deployment_id,
  );
  if (!deployment || deployment.status !== "active") {
    return {
      ok: false,
      status: 503,
      code: "deployment_inactive",
      reason: "当前部署未注册或未启用，指令未下发。",
    };
  }

  const device = registry.devices.find(
    (item) =>
      item.deployment_id === settings.deployment_id && item.device_id === target.device.device_id,
  );
  if (!device || device.status !== "active") {
    return {
      ok: false,
      status: 503,
      code: "device_inactive",
      reason: "目标设备未注册为 active，指令未下发。",
    };
  }
  if (device.node_id !== target.node_id) {
    return {
      ok: false,
      status: 503,
      code: "node_binding_mismatch",
      reason: "目标设备的 Scene Node 绑定已变化，指令未下发。",
    };
  }

  const node = registry.nodes?.find(
    (item) => item.deployment_id === settings.deployment_id && item.node_id === target.node_id,
  );
  if (!node || node.status !== "active") {
    return {
      ok: false,
      status: 503,
      code: "node_inactive",
      reason: "目标 Scene Node 未注册为 active，指令未下发。",
    };
  }

  const runtime = getNodeRuntimeStatus(target.node_id, Date.now(), target.deployment_id);
  if (!runtime.online) {
    return {
      ok: false,
      status: 503,
      code: "node_offline",
      reason: "目标 Scene Node 当前不在线，指令未下发。",
    };
  }

  return { ok: true };
}

export function assertDispatchableCommand(
  ctx: PlatformRuntimeContext,
  command: CommandMessage,
): DispatchabilityResult {
  const registry = ctx.services.getLoadRegistry()();
  const device = registry.devices.find(
    (item) => item.deployment_id === command.deployment_id && item.device_id === command.device_id,
  );
  if (!device) {
    return {
      ok: false,
      status: 503,
      code: "device_inactive",
      reason: "目标设备未注册为 active，指令未下发。",
    };
  }
  return assertDispatchableTarget(ctx, {
    deployment_id: command.deployment_id,
    node_id: command.node_id,
    config_version: command.config_version,
    transport: device.transport,
    device,
  });
}
