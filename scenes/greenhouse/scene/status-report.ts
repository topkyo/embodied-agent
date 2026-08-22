import { formatGreenhouseLabel, formatGreenhouseMetricValue } from "./labels.js";
import type { DomainPackScheduledReports, SceneTelemetrySlice } from "@embodied-agent/core";

export type GreenhouseStatusReportSchedule = {
  greenhouse_ids: string[];
  interval_minutes: number;
};

export type GreenhouseStatusTelemetry = {
  temperature_c: number;
  humidity_percent: number;
  vent_status: string;
  fan_status: string;
};

export type GreenhouseStatusReportServices = {
  getTelemetry: (entityId: string) => GreenhouseStatusTelemetry | undefined;
};

function toGreenhouseStatusTelemetry(
  telemetry: SceneTelemetrySlice | undefined,
  entityId: string,
): GreenhouseStatusTelemetry | undefined {
  if (!telemetry) return undefined;
  const temperature = telemetry.temperature_c;
  const humidity = telemetry.humidity_percent;
  const vent = telemetry.vent_status;
  const fan = telemetry.fan_status;
  if (
    typeof temperature !== "number" ||
    typeof humidity !== "number" ||
    typeof vent !== "string" ||
    typeof fan !== "string"
  ) {
    throw new Error(`unsupported greenhouse status telemetry for ${entityId}`);
  }
  return {
    temperature_c: temperature,
    humidity_percent: humidity,
    vent_status: vent,
    fan_status: fan,
  };
}

export function buildGreenhouseStatusReportMessage(
  schedule: GreenhouseStatusReportSchedule,
  services: GreenhouseStatusReportServices,
): string {
  const lines = [`【定时汇报】每 ${schedule.interval_minutes} 分钟`];
  for (const id of schedule.greenhouse_ids) {
    const t = services.getTelemetry(id);
    const label = formatGreenhouseLabel(id);
    if (!t) {
      lines.push(`${label}：暂无遥测数据`);
      continue;
    }
    lines.push(
      `${label}：${formatGreenhouseMetricValue("temperature_c", t.temperature_c)} / ${formatGreenhouseMetricValue("humidity_percent", t.humidity_percent)}，通风${t.vent_status}，风机${t.fan_status}`,
    );
  }
  return lines.join("\n");
}

export const GREENHOUSE_SCHEDULED_REPORTS: DomainPackScheduledReports = {
  buildMessage(schedule, services) {
    return buildGreenhouseStatusReportMessage(
      {
        greenhouse_ids: [...schedule.entityIds],
        interval_minutes: schedule.intervalMinutes,
      },
      {
        getTelemetry: (entityId) =>
          toGreenhouseStatusTelemetry(services.getTelemetry(entityId), entityId),
      },
    );
  },
};
