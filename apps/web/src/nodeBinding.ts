import type { BindNodeDeviceTemplate } from "./api";

export type BindNodeDevice = {
  device_id: string;
  device_type: string;
  name: string;
  channel?: string;
  metrics?: string[];
  default_for?: string;
  max_duration_seconds?: number;
  status?: string;
};

/**
 * active pack 的 deviceTemplate 注入点：由 ops shell（Pair / NodeManagementPanel）
 * 在渲染前从 useOpsSchema() 取出 devices.binding.deviceTemplate 注册到这里，
 * 使下方 packId-签名函数保持 schema-driven，不再硬编码 packId 分支。
 */
const activeDeviceTemplates = new Map<string, readonly BindNodeDeviceTemplate[]>();

export function registerDeviceTemplateForPack(
  packId: string,
  template: readonly BindNodeDeviceTemplate[] | undefined,
): void {
  if (template && template.length > 0) {
    activeDeviceTemplates.set(packId, template);
  } else {
    activeDeviceTemplates.delete(packId);
  }
}

/** 绑定新节点时用 node 专属 device_id，避免与当前 registry 冲突。 */
export function supportsDeviceTemplateForPack(packId: string): boolean {
  return activeDeviceTemplates.has(packId);
}

export function devicesTemplateForNode(nodeId: string, packId: string): BindNodeDevice[] {
  const template = activeDeviceTemplates.get(packId);
  if (!template) return [];
  const suffix = nodeId.replace(/^node-/, "");
  return template.map((item) => {
    const device: BindNodeDevice = {
      device_id: item.device_id.replace(/\{node\}/g, suffix),
      device_type: item.device_type,
      name: item.name,
    };
    if (item.channel) device.channel = item.channel;
    if (item.metrics) device.metrics = [...item.metrics];
    if (item.default_for) device.default_for = item.default_for;
    if (item.max_duration_seconds != null) {
      device.max_duration_seconds = item.max_duration_seconds;
    }
    if (item.status) device.status = item.status;
    return device;
  });
}
