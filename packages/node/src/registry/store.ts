import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { atomicWriteJson, resolveAgentDataDir as dataRoot } from "@embodied-agent/platform";
import type { DeviceRegistry, Node } from "@embodied-agent/core";

const REGISTRY_FILE = "device-registry.json";

function registryPath(): string {
  return resolve(dataRoot(), REGISTRY_FILE);
}

export function loadRegistry(): DeviceRegistry {
  const path = registryPath();
  if (!existsSync(path)) {
    throw new Error(
      `缺少 device-registry.json：请在 ${path} 显式配置设备注册表，或通过节点绑定流程生成。`,
    );
  }
  try {
    const registry = JSON.parse(readFileSync(path, "utf8")) as DeviceRegistry;
    validateRegistry(registry);
    return registry;
  } catch (e) {
    throw new Error(
      `device-registry.json 无法读取或校验失败：${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
}

export function saveRegistry(registry: DeviceRegistry): DeviceRegistry {
  validateRegistry(registry);
  const path = registryPath();
  mkdirSync(dataRoot(), { recursive: true });
  atomicWriteJson(path, registry);
  return registry;
}

export function validateRegistry(registry: DeviceRegistry): void {
  if (!registry || typeof registry !== "object") {
    throw new Error("设备注册表必须是对象。");
  }
  if (!Array.isArray(registry.deployments)) {
    throw new Error("设备注册表缺少 deployments 数组。");
  }
  if (!Array.isArray(registry.entities)) {
    throw new Error("设备注册表缺少 entities 数组。");
  }
  if (!Array.isArray(registry.devices)) {
    throw new Error("设备注册表缺少 devices 数组。");
  }

  const deploymentIds = new Set<string>();
  for (const deployment of registry.deployments) {
    if (!deployment.deployment_id?.trim()) {
      throw new Error("部署缺少 deployment_id。");
    }
    if (deploymentIds.has(deployment.deployment_id)) {
      throw new Error(`部署 ID 重复：${deployment.deployment_id}`);
    }
    deploymentIds.add(deployment.deployment_id);
  }

  const aliasKeys = new Set<string>();
  const entityIds = new Set<string>();
  for (const entity of registry.entities) {
    if (!entity.entity_id?.trim()) {
      throw new Error("实体缺少 entity_id。");
    }
    if (!entity.entity_type?.trim()) {
      throw new Error(`实体 ${entity.entity_id} 缺少 entity_type。`);
    }
    if (!entity.domain_id?.trim()) {
      throw new Error(`实体 ${entity.entity_id} 缺少 domain_id。`);
    }
    if (!deploymentIds.has(entity.deployment_id)) {
      throw new Error(`实体 ${entity.entity_id} 引用了不存在的部署：${entity.deployment_id}`);
    }
    if (entityIds.has(entity.entity_id)) {
      throw new Error(`实体 ID 重复：${entity.entity_id}`);
    }
    entityIds.add(entity.entity_id);
    for (const alias of entity.aliases ?? []) {
      const raw = alias.trim().toLowerCase();
      if (!raw) continue;
      const key = `${entity.domain_id}:${raw}`;
      if (aliasKeys.has(key)) {
        throw new Error(`实体别名冲突：${alias}`);
      }
      aliasKeys.add(key);
    }
  }

  // nodes 校验（可选数组，Scene Node 自注册与绑定使用）
  const nodeIds = new Set<string>();
  const nodes: Node[] = Array.isArray(registry.nodes) ? (registry.nodes as Node[]) : [];
  for (const n of nodes) {
    if (!n.node_id?.trim()) {
      throw new Error("节点缺少 node_id。");
    }
    if (!deploymentIds.has(n.deployment_id)) {
      throw new Error(`节点 ${n.node_id} 引用了不存在的部署：${n.deployment_id}`);
    }
    if (n.entity_id && !entityIds.has(n.entity_id)) {
      throw new Error(`节点 ${n.node_id} 引用了不存在的实体：${n.entity_id}`);
    }
    if (nodeIds.has(n.node_id)) {
      throw new Error(`节点 ID 重复：${n.node_id}`);
    }
    if (!["pending", "active", "disabled", "maintenance"].includes(n.status)) {
      throw new Error(`节点 ${n.node_id} 状态无效：${n.status}`);
    }
    nodeIds.add(n.node_id);
  }

  const deviceIds = new Set<string>();
  for (const d of registry.devices) {
    if (!d.device_id?.trim()) {
      throw new Error("设备缺少 device_id。");
    }
    if (!deploymentIds.has(d.deployment_id)) {
      throw new Error(`设备 ${d.device_id} 引用了不存在的部署：${d.deployment_id}`);
    }
    if (d.entity_id && !entityIds.has(d.entity_id)) {
      throw new Error(`设备 ${d.device_id} 引用了不存在的实体：${d.entity_id}`);
    }
    if (!d.node_id?.trim()) {
      throw new Error(`设备 ${d.device_id} 缺少 node_id。`);
    }
    if (d.node_id && !nodeIds.has(d.node_id)) {
      throw new Error(`设备 ${d.device_id} 引用了不存在的节点：${d.node_id}`);
    }
    if (!d.device_type?.trim()) {
      throw new Error(`设备 ${d.device_id} 缺少 device_type。`);
    }
    if (!["active", "offline", "maintenance", "disabled"].includes(d.status)) {
      throw new Error(`设备 ${d.device_id} 状态无效：${d.status}`);
    }
    if (deviceIds.has(d.device_id)) {
      throw new Error(`设备 ID 重复：${d.device_id}`);
    }
    deviceIds.add(d.device_id);
  }
}
