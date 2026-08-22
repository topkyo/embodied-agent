import type { DomainPackScheduledReports, SceneTelemetrySlice } from "@embodied-agent/core";

export type IndustrialStatusTelemetry = {
  temperature_c: number;
  fan_status: string;
};

export type IndustrialStatusReportSchedule = {
  cabinet_ids: string[];
  interval_minutes: number;
};

export type IndustrialStatusReportServices = {
  getTelemetry: (entityId: string) => IndustrialStatusTelemetry | undefined;
};

function toIndustrialStatusTelemetry(
  telemetry: SceneTelemetrySlice | undefined,
  entityId: string,
): IndustrialStatusTelemetry | undefined {
  if (!telemetry) return undefined;
  const temperature = telemetry.temperature_c;
  const raw = telemetry.fan_status ?? telemetry.exhaust_status ?? telemetry.relay_state;
  if (typeof temperature !== "number" || (typeof raw !== "string" && typeof raw !== "number")) {
    throw new Error(`unsupported industrial status telemetry for ${entityId}`);
  }
  const fan_status =
    raw === "on" || raw === 1 ? "on" : raw === "off" || raw === 0 ? "off" : String(raw);
  return { temperature_c: temperature, fan_status };
}

export function buildIndustrialStatusReportMessage(
  schedule: IndustrialStatusReportSchedule,
  services: IndustrialStatusReportServices,
): string {
  const lines = [`【定时排风报告】每 ${schedule.interval_minutes} 分钟`];
  for (const id of schedule.cabinet_ids) {
    const t = services.getTelemetry(id);
    if (!t) {
      lines.push(`${id}：暂无遥测数据`);
      continue;
    }
    const fanText = t.fan_status === "on" ? "运行" : t.fan_status === "off" ? "停止" : t.fan_status;
    lines.push(`${id}：${t.temperature_c.toFixed(1)}°C，排风${fanText}。`);
  }
  return lines.join("\n");
}

export const INDUSTRIAL_SCHEDULED_REPORTS: DomainPackScheduledReports = {
  buildMessage(schedule, services) {
    return buildIndustrialStatusReportMessage(
      {
        cabinet_ids: [...schedule.entityIds],
        interval_minutes: schedule.intervalMinutes,
      },
      {
        getTelemetry: (entityId) =>
          toIndustrialStatusTelemetry(services.getTelemetry(entityId), entityId),
      },
    );
  },
};
