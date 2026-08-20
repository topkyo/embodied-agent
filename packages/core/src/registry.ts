import type { Deployment, Device, RegistryEntity, Node } from "./schemas/device.js";

export type RegistryDevice = Device & {
  default_for?: string;
  max_duration_seconds?: number;
  confirm_duration_threshold_seconds?: number;
  manual_override?: boolean;
  channel?: string;
  metrics?: string[];
  zone_id?: string;
};

/** 设备注册表：deployments / entities / nodes / devices 为平台层；实体语义由 Domain Pack 解释。 */
export type DeviceRegistry = {
  deployments: Deployment[];
  entities: RegistryEntity[];
  nodes?: Node[];
  devices: RegistryDevice[];
};
