import { formatGreenhouseLabel } from "./labels.js";

export type IrrigationCommandRecord = {
  status: string;
  updated_at: string;
  command: {
    device_id: string;
    action: string;
    parameters?: Record<string, unknown>;
    issued_by: { user_id: string };
  };
  error?: { message?: string };
  result?: Record<string, unknown>;
};

type IrrigationRegistryDevice = {
  device_id: string;
  device_type?: string;
  entity_id?: string;
  zone_id?: string;
  default_for?: string;
};

export type IrrigationStatusServices = {
  listDevices?: () => IrrigationRegistryDevice[];
  listCommands?: () => readonly IrrigationCommandRecord[];
};

type IrrigationDevice = {
  device_id: string;
  zone_id?: string;
  greenhouse_id?: string;
};

const ACTIVE_STATUSES = new Set(["created", "sent", "acknowledged", "running"]);

const STATUS_LABEL: Record<string, string> = {
  created: "已创建，等待下发",
  sent: "已提交，等待设备确认",
  acknowledged: "设备已确认",
  running: "灌溉进行中",
  completed: "已完成",
  rejected: "设备拒绝",
  failed: "执行失败",
  timeout: "超时未响应",
};

function formatDurationZh(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} 小时`;
  if (seconds % 60 === 0) return `${seconds / 60} 分钟`;
  return `${seconds} 秒`;
}

function zoneLabel(zoneId: string): string {
  if (zoneId === "zone-a") return "A区";
  if (zoneId === "zone-b") return "B区";
  return zoneId;
}

function listIrrigationDevices(devices: readonly IrrigationRegistryDevice[]): IrrigationDevice[] {
  return devices
    .filter(
      (device) => device.device_type === "irrigation_valve" || device.default_for === "irrigation",
    )
    .map((device) => ({
      device_id: device.device_id,
      zone_id: device.zone_id,
      greenhouse_id: device.entity_id,
    }));
}

function irrigationCommandsForDevice(
  deviceId: string,
  services: IrrigationStatusServices,
  userId?: string,
): IrrigationCommandRecord[] {
  return [...(services.listCommands?.() ?? [])]
    .filter(
      (record) =>
        record.command.device_id === deviceId &&
        (record.command.action === "start" || record.command.action === "stop"),
    )
    .filter((record) => !userId || record.command.issued_by.user_id === userId)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function isIrrigationActive(record: IrrigationCommandRecord): boolean {
  return record.command.action === "start" && ACTIVE_STATUSES.has(record.status);
}

function latestIrrigationRecord(
  deviceId: string,
  services: IrrigationStatusServices,
  userId?: string,
): IrrigationCommandRecord | undefined {
  return irrigationCommandsForDevice(deviceId, services, userId)[0];
}

function formatDeviceContext(dev: IrrigationDevice): string {
  const parts: string[] = [];
  if (dev.zone_id) parts.push(zoneLabel(dev.zone_id));
  if (dev.greenhouse_id) parts.push(formatGreenhouseLabel(dev.greenhouse_id));
  return parts.length > 0 ? parts.join(" ") : dev.device_id;
}

function formatIrrigationStatusReply(
  dev: IrrigationDevice,
  record: IrrigationCommandRecord | undefined,
): string {
  const context = formatDeviceContext(dev);
  if (!record) {
    return `${context}：当前无灌溉记录。`;
  }

  if (isIrrigationActive(record)) {
    const planned = record.command.parameters?.duration_seconds;
    const duration =
      typeof planned === "number" && planned > 0 ? `（计划 ${formatDurationZh(planned)}）` : "";
    const label = STATUS_LABEL[record.status] ?? record.status;
    return `${context} 正在灌溉${duration}，${label}。`;
  }

  if (record.command.action === "stop") {
    const label = STATUS_LABEL[record.status] ?? record.status;
    if (record.status === "completed" || record.status === "running") {
      return `${context}：灌溉已停止（${label}）。`;
    }
    return `${context}：当前未在灌溉（最近为停止指令，${label}）。`;
  }

  if (record.status === "completed") {
    const actual = record.result?.actual_duration_seconds;
    const planned = record.command.parameters?.duration_seconds;
    const seconds =
      typeof actual === "number" && actual > 0
        ? actual
        : typeof planned === "number"
          ? planned
          : undefined;
    if (seconds) {
      return `${context}：当前未在灌溉（最近一次灌溉 ${formatDurationZh(seconds)} 已完成）。`;
    }
    return `${context}：当前未在灌溉（最近一次灌溉已完成）。`;
  }

  if (record.status === "rejected" || record.status === "failed") {
    const detail = record.error?.message ?? STATUS_LABEL[record.status];
    return `${context}：当前未在灌溉（最近一次灌溉未成功：${detail}）。`;
  }

  return `${context}：当前未在灌溉。`;
}

function resolveIrrigationQueryTargets(
  opts: { zone_id?: string; greenhouse_id?: string },
  services: IrrigationStatusServices,
): IrrigationDevice[] {
  let devices = listIrrigationDevices(services.listDevices?.() ?? []);
  if (opts.zone_id) {
    devices = devices.filter((device) => device.zone_id === opts.zone_id);
  }
  if (opts.greenhouse_id) {
    devices = devices.filter((device) => device.greenhouse_id === opts.greenhouse_id);
  }
  return devices;
}

export function formatIrrigationQueryReply(
  opts: {
    zone_id?: string;
    greenhouse_id?: string;
    user_id: string;
  },
  services: IrrigationStatusServices,
): { reply: string; params: Record<string, unknown> } {
  const targets = resolveIrrigationQueryTargets(opts, services);
  if (targets.length === 0) {
    const zone = opts.zone_id ? zoneLabel(opts.zone_id) : "指定分区";
    return {
      reply: `${zone} 未找到已绑定的灌溉设备，请在配置台检查 device-registry。`,
      params: { zone_id: opts.zone_id, count: 0 },
    };
  }

  const lines = targets.map((dev) => {
    const record = latestIrrigationRecord(dev.device_id, services, opts.user_id);
    return formatIrrigationStatusReply(dev, record);
  });

  const anyActive = targets.some((dev) => {
    const record = latestIrrigationRecord(dev.device_id, services, opts.user_id);
    return record ? isIrrigationActive(record) : false;
  });

  return {
    reply: lines.join("\n"),
    params: {
      zone_id: opts.zone_id,
      count: targets.length,
      any_active: anyActive,
    },
  };
}
