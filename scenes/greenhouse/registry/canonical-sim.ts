import type { Node } from "@embodied-agent/core";
import type { DeviceRegistry } from "./device-registry.js";

/** 双棚模拟器 canonical 节点（rebind / ensure / 默认种子共用） */
export const SIM_NODE_IDS = ["node-sim-gh-001", "node-sim-gh-002"] as const;

export const CANONICAL_SIM_NODE_ID = SIM_NODE_IDS[0];

export type SimBindDevice = {
  /** MQTT rebind body 与节点配置使用的 device_id */
  device_id: string;
  device_type: string;
  name: string;
  channel?: string;
  metrics?: string[];
  zone_id?: string;
  default_for?: "vent_motor" | "fan" | "greenhouse_controller" | "irrigation";
  max_duration_seconds?: number;
  /** 持久化注册表 device_id（缺省与 device_id 相同） */
  registry_device_id?: string;
  aliases?: string[];
};

export type SimNodePreset = {
  deployment_id: string;
  greenhouse_id: string;
  devices: SimBindDevice[];
};

export const SIM_NODE_PRESETS: Record<(typeof SIM_NODE_IDS)[number], SimNodePreset> = {
  "node-sim-gh-001": {
    deployment_id: "dep-gh-pilot-001",
    greenhouse_id: "gh-001",
    devices: [
      {
        device_id: "sensor-sim-gh-001",
        device_type: "sensor",
        name: "1号棚模拟温湿度",
        aliases: ["模拟温湿度", "1号棚模拟传感器"],
        channel: "i2c:0x44",
        metrics: ["temperature_c", "humidity_percent"],
      },
      {
        device_id: "vent-sim-gh-001",
        device_type: "vent_motor",
        name: "1号棚模拟左侧帘",
        aliases: ["模拟左侧帘", "1号棚模拟侧帘", "1号棚侧帘", "一号棚侧帘"],
        channel: "relay:vent_left",
        default_for: "vent_motor",
      },
      {
        device_id: "fan-sim-gh-001",
        device_type: "fan",
        name: "1号棚模拟风机",
        aliases: ["模拟风机", "1号棚风机", "一号棚风机"],
        channel: "relay:fan_01",
        default_for: "fan",
      },
      {
        // MQTT/rebind 用 ghc-sim-gh-001；注册表持久化沿用历史 ID gh-001（config-sync/指令层）
        device_id: "ghc-sim-gh-001",
        registry_device_id: "gh-001",
        device_type: "greenhouse_controller",
        name: "1 号棚环控器",
        aliases: ["1号棚环控器"],
        default_for: "greenhouse_controller",
      },
      {
        device_id: "irrigation-sim-gh-001",
        device_type: "irrigation_valve",
        name: "1号棚A区灌溉阀",
        aliases: ["A区灌溉", "1号棚A区浇水"],
        channel: "relay:irrigation_a",
        zone_id: "zone-a",
        default_for: "irrigation",
        max_duration_seconds: 3600,
      },
    ],
  },
  "node-sim-gh-002": {
    deployment_id: "dep-gh-pilot-001",
    greenhouse_id: "gh-002",
    devices: [
      {
        device_id: "sensor-sim-gh-002",
        device_type: "sensor",
        name: "2号棚温湿度",
        aliases: ["2号棚模拟温湿度", "2号棚模拟传感器"],
        channel: "i2c:0x44",
        metrics: ["temperature_c", "humidity_percent"],
      },
      {
        device_id: "vent-sim-gh-002",
        device_type: "vent_motor",
        name: "2号棚左侧帘",
        aliases: ["2号棚侧帘", "二号棚侧帘", "2号棚模拟侧帘"],
        channel: "relay:vent_left",
        default_for: "vent_motor",
      },
      {
        device_id: "fan-sim-gh-002",
        device_type: "fan",
        name: "2号棚风机",
        aliases: ["2号棚模拟风机", "二号棚风机"],
        channel: "relay:fan_01",
        default_for: "fan",
      },
      {
        // gh-002 无历史别名，注册表与 MQTT 均用 ghc-sim-gh-002
        device_id: "ghc-sim-gh-002",
        device_type: "greenhouse_controller",
        name: "2 号棚环控器",
        aliases: ["2号棚环控器"],
        default_for: "greenhouse_controller",
      },
      {
        device_id: "irrigation-sim-gh-002",
        device_type: "irrigation_valve",
        name: "2号棚B区灌溉阀",
        aliases: ["B区灌溉", "2号棚B区浇水"],
        channel: "relay:irrigation_b",
        zone_id: "zone-b",
        default_for: "irrigation",
        max_duration_seconds: 3600,
      },
    ],
  },
};

const CANONICAL_DEPLOYMENTS: DeviceRegistry["deployments"] = [
  {
    deployment_id: "dep-gh-pilot-001",
    name: "守棚工长试点",
    timezone: "Asia/Shanghai",
    status: "active",
  },
];

const CANONICAL_ENTITIES: DeviceRegistry["entities"] = [
  {
    deployment_id: "dep-gh-pilot-001",
    domain_id: "agriculture",
    entity_type: "greenhouse",
    entity_id: "gh-001",
    name: "1 号棚",
    aliases: ["1号棚", "一号棚", "1棚"],
    status: "active",
  },
  {
    deployment_id: "dep-gh-pilot-001",
    domain_id: "agriculture",
    entity_type: "greenhouse",
    entity_id: "gh-002",
    name: "2 号棚",
    aliases: ["2号棚", "二号棚", "2棚"],
    status: "active",
  },
];

function presetDevicesForRebind(node_id: (typeof SIM_NODE_IDS)[number]): SimBindDevice[] {
  return SIM_NODE_PRESETS[node_id].devices;
}

/** rebind API body：省略 aliases；保留 registry_device_id 供 applyNodeBinding 对齐种子 ID */
export function simRebindDevices(node_id: (typeof SIM_NODE_IDS)[number]): object[] {
  return presetDevicesForRebind(node_id).map(({ aliases: _a, ...d }) => d);
}

export function buildCanonicalSimRegistry(): DeviceRegistry {
  const nodes: Node[] = [];
  const devices: DeviceRegistry["devices"] = [];

  for (const node_id of SIM_NODE_IDS) {
    const preset = SIM_NODE_PRESETS[node_id];
    nodes.push({
      node_id,
      deployment_id: preset.deployment_id,
      entity_id: preset.greenhouse_id,
      firmware_version: "sim-0.3.0",
      config_version: 1,
      status: "active",
    });

    for (const d of preset.devices) {
      const device_id = d.registry_device_id ?? d.device_id;
      devices.push({
        device_id,
        deployment_id: preset.deployment_id,
        entity_id: preset.greenhouse_id,
        device_type: d.device_type as DeviceRegistry["devices"][number]["device_type"],
        name: d.name,
        aliases: d.aliases ?? [],
        node_id,
        status: "active",
        ...(d.channel ? { channel: d.channel } : {}),
        ...(d.metrics ? { metrics: d.metrics } : {}),
        ...(d.zone_id ? { zone_id: d.zone_id } : {}),
        ...(d.default_for ? { default_for: d.default_for } : {}),
        ...(d.max_duration_seconds != null ? { max_duration_seconds: d.max_duration_seconds } : {}),
      });
    }
  }

  return {
    deployments: CANONICAL_DEPLOYMENTS,
    entities: CANONICAL_ENTITIES,
    nodes,
    devices,
  };
}

export function listGreenhouseIds(registry: DeviceRegistry): string[] {
  return registry.entities
    .filter((entity) => entity.domain_id === "agriculture" && entity.entity_type === "greenhouse")
    .map((entity) => entity.entity_id);
}

export function hasDefaultVentMotor(registry: DeviceRegistry, greenhouse_id: string): boolean {
  return registry.devices.some(
    (d) =>
      d.entity_id === greenhouse_id &&
      d.device_type === "vent_motor" &&
      d.default_for === "vent_motor" &&
      Boolean(d.node_id),
  );
}
