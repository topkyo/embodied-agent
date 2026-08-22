import { loadRegistry, saveRegistry } from "../registry/store.js";
import type { DeviceRegistry, Node, RegistryDevice } from "@embodied-agent/core";

/**
 * 向 registry.nodes 中 upsert 一个节点记录（pending 或 active）。
 * 节点是 registry 的第一等成员，由云端 registry 作为唯一真源。
 */
export function upsertNodeInRegistry(node: Node): DeviceRegistry {
  const registry = loadRegistry();
  const nodes = Array.isArray(registry.nodes) ? [...registry.nodes] : [];
  const idx = nodes.findIndex(
    (n) => n.deployment_id === node.deployment_id && n.node_id === node.node_id,
  );
  if (idx >= 0) {
    const existing = nodes[idx]!;
    nodes[idx] = {
      ...existing,
      ...node,
      name: node.name ?? existing.name,
      entity_id: node.entity_id ?? existing.entity_id,
      registered_at: existing.registered_at ?? node.registered_at,
    };
  } else {
    nodes.push(node);
  }
  return saveRegistry({ ...registry, nodes });
}

export function getNode(deployment_id: string, node_id: string): Node | undefined {
  const registry = loadRegistry();
  return (registry.nodes ?? []).find(
    (n) => n.deployment_id === deployment_id && n.node_id === node_id,
  );
}

export function listNodes(deployment_id: string, status?: Node["status"]): Node[] {
  const registry = loadRegistry();
  const all = (registry.nodes ?? []).filter((n) => n.deployment_id === deployment_id);
  if (!status) return all;
  return all.filter((n) => n.status === status);
}

/**
 * 管理员绑定后更新节点状态为 active，并设置 config_version。
 */
export function activateNode(deployment_id: string, node_id: string, configVersion = 1): Node {
  const registry = loadRegistry();
  const nodes = Array.isArray(registry.nodes) ? [...(registry.nodes as Node[])] : [];
  const idx = nodes.findIndex((n) => n.deployment_id === deployment_id && n.node_id === node_id);
  if (idx < 0) {
    throw new Error(`node_not_found: ${deployment_id}/${node_id}`);
  }
  const updated: Node = {
    ...nodes[idx],
    status: "active",
    config_version: configVersion,
    last_seen_at: new Date().toISOString(),
  };
  nodes[idx] = updated;
  saveRegistry({ ...registry, nodes });
  return updated;
}

export type BindingDeviceInput = {
  device_id: string;
  /** 可选：注册表持久化 ID，MQTT 仍用 device_id */
  registry_device_id?: string;
  device_type: RegistryDevice["device_type"];
  name: string;
  aliases?: string[];
  status?: RegistryDevice["status"];
  default_for?: string;
  max_duration_seconds?: number;
  confirm_duration_threshold_seconds?: number;
  channel?: string;
  metrics?: string[];
  zone_id?: string;
  // 其他安全字段透传
  [k: string]: unknown;
};

/**
 * 管理员确认绑定：更新 node 状态 + config_version，并将提供的 devices 写入 registry（带 node_id 绑定）。
 * 旧的同 node_id 设备会被移除（以本次绑定列表为准）。
 */
export function applyNodeBinding(
  node_id: string,
  deployment_id: string,
  entity_id: string | undefined,
  devices: BindingDeviceInput[],
): { node: Node; registry: DeviceRegistry } {
  const registry = loadRegistry();

  // 1. 更新/激活 node
  const nodes = Array.isArray(registry.nodes) ? [...(registry.nodes as Node[])] : [];
  const nIdx = nodes.findIndex((n) => n.deployment_id === deployment_id && n.node_id === node_id);
  if (nIdx < 0) {
    throw new Error(`node_not_found: ${deployment_id}/${node_id}`);
  }
  const nextConfigVersion = (nodes[nIdx].config_version ?? 0) + 1;
  const updatedNode: Node = {
    ...nodes[nIdx],
    deployment_id,
    entity_id,
    status: "active",
    config_version: nextConfigVersion,
    last_seen_at: new Date().toISOString(),
  };
  nodes[nIdx] = updatedNode;

  // 2. 重建该 node 的 devices（以绑定提交为准）
  const otherDevices = registry.devices.filter(
    (d) => d.deployment_id !== deployment_id || d.node_id !== node_id,
  );
  const boundDevices = devices.map((d) => {
    const aliases = d.aliases ?? (d.name ? [d.name] : []);
    const registryDeviceId =
      typeof d.registry_device_id === "string" && d.registry_device_id.trim()
        ? d.registry_device_id.trim()
        : d.device_id;
    const boundDevice: RegistryDevice = {
      device_id: registryDeviceId,
      deployment_id,
      entity_id,
      device_type: d.device_type,
      name: d.name,
      aliases,
      node_id,
      status: d.status ?? "active",
      default_for: d.default_for,
      max_duration_seconds: d.max_duration_seconds,
      confirm_duration_threshold_seconds: d.confirm_duration_threshold_seconds,
      // 透传 channel/metrics 等供 node config 使用（当前 registry 宽松存储）
      ...(d.channel ? { channel: d.channel } : {}),
      ...(d.metrics ? { metrics: d.metrics } : {}),
      ...(d.zone_id ? { zone_id: d.zone_id } : {}),
    };
    return boundDevice;
  });

  const nextRegistry: DeviceRegistry = {
    ...registry,
    nodes,
    devices: [...otherDevices, ...boundDevices],
  };

  const saved = saveRegistry(nextRegistry);
  return { node: updatedNode, registry: saved };
}
