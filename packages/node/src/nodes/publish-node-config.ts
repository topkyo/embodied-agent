import type { Device } from "@embodied-agent/core";
import type { MqttCommandPublisher } from "../mqtt/client.js";
import { loadRegistry } from "../registry/store.js";
import { getNode } from "./registry.js";

function deviceActions(device?: Pick<Device, "capabilities">): string[] | undefined {
  if (device?.capabilities?.length) return device.capabilities;
  return undefined;
}

export async function publishRegistryNodeConfig(
  mqtt: MqttCommandPublisher,
  node_id: string,
  deployment_id: string,
): Promise<{ ok: true; config_version: number } | { ok: false; error: string }> {
  const node = getNode(deployment_id, node_id);
  if (!node) return { ok: false, error: `node_not_found: ${deployment_id}/${node_id}` };
  const registryCv = node.config_version ?? 0;
  if (registryCv <= 0) {
    return { ok: false, error: "config_version_not_set" };
  }

  const registry = loadRegistry();
  const nodeDevs = registry.devices
    .filter((d) => d.deployment_id === deployment_id && d.node_id === node_id)
    .map((d) => ({
      device_id: d.device_id,
      device_type: d.device_type,
      channel: d.channel,
      metrics: d.metrics,
      actions: deviceActions(d),
      max_duration_seconds: d.max_duration_seconds,
    }));

  try {
    await mqtt.publishNodeConfig({
      deployment_id,
      node_id,
      config_version: registryCv,
      entity_id: node.entity_id,
      devices: nodeDevs,
    });
    return { ok: true, config_version: registryCv };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "mqtt_publish_failed",
    };
  }
}
