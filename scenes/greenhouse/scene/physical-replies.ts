import type { IntentPayload } from "@embodied-agent/core";

export function greenhousePhysicalCommandSentReply(
  skill: IntentPayload["skill"],
): string | undefined {
  if (skill === "greenhouse.set_mode") {
    return "环控指令已下发，正等待设备确认；若失败会微信通知您。";
  }
  if (skill === "irrigation.start" || skill === "irrigation.stop") {
    return "灌溉指令已下发，正等待设备确认；若失败会微信通知您。";
  }
  if (skill === "fan.start" || skill === "fan.stop") {
    return "风机指令已下发，正等待设备确认；若失败会微信通知您。";
  }
  if (
    skill === "greenhouse.open_vent" ||
    skill === "greenhouse.close_vent" ||
    skill === "greenhouse.stop_vent"
  ) {
    return "通风/设备指令已下发，正等待设备确认；若失败会微信通知您。";
  }
  return undefined;
}

export function greenhousePendingSummary(intent: IntentPayload): string | undefined {
  const target = intent.target as {
    greenhouse_id?: string;
    zone_id?: string;
  };
  const params = intent.parameters as {
    duration_seconds?: number;
    mode?: string;
    temp_high_c?: number;
    max_temp_c?: number;
  };
  if (intent.skill === "greenhouse.open_vent") {
    return `${target.greenhouse_id} 通风 ${params.duration_seconds} 秒`;
  }
  if (intent.skill === "greenhouse.close_vent") {
    return `${target.greenhouse_id} 关通风 ${params.duration_seconds} 秒`;
  }
  if (intent.skill === "greenhouse.set_mode" && params.mode === "night_vent") {
    const high = params.temp_high_c ?? params.max_temp_c ?? 30;
    return `${target.greenhouse_id} 夜间自动通风（≥${high}°C 开帘）`;
  }
  if (intent.skill === "irrigation.start") {
    const zone = target.zone_id ?? "默认区";
    const gh = target.greenhouse_id;
    const where = gh ? `${gh} ${zone}` : zone;
    return `灌溉 ${where} ${formatDurationZh(params.duration_seconds ?? 0)}`;
  }
  if (intent.skill === "irrigation.stop") {
    const zone = target.zone_id ?? "默认区";
    return `停止灌溉 ${zone}`;
  }
  return undefined;
}

function formatDurationZh(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} 小时`;
  if (seconds % 60 === 0) return `${seconds / 60} 分钟`;
  return `${seconds} 秒`;
}
