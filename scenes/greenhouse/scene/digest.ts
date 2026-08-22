import type { DomainPackDigest, SceneModeState, SceneTelemetrySlice } from "@embodied-agent/core";
import { resolveSceneForTrigger } from "./registry.js";
import { formatGreenhouseMetricValue } from "./labels.js";
import { toGreenhouseTelemetry } from "./telemetry-adapter.js";

const MORNING_DEW_HUMIDITY_THRESHOLD = 85;

export type GreenhouseDigestSlot = "morning" | "evening";

export type GreenhouseDigestTelemetry = {
  greenhouse_id: string;
  temperature_c: number;
  humidity_percent: number;
  vent_status: string;
  fan_status: string;
};

export type GreenhouseDigestOperationLog = {
  ts: string;
  skill: string;
  result: string;
};

export type GreenhouseDigestServices = {
  getAllTelemetry: () => readonly GreenhouseDigestTelemetry[];
  getModeByEntityId: (entityId: string) => SceneModeState | undefined | null;
  queryLogsToday: (deploymentId: string) => readonly GreenhouseDigestOperationLog[];
};

function toGreenhouseDigestTelemetry(slice: SceneTelemetrySlice): GreenhouseDigestTelemetry {
  if (typeof slice.temperature_c !== "number" || typeof slice.humidity_percent !== "number") {
    throw new Error(
      `greenhouse digest telemetry 字段不完整：${slice.entity_id} (${Object.keys(slice).join(",")})`,
    );
  }
  const telemetry = toGreenhouseTelemetry(slice);
  return {
    greenhouse_id: telemetry.greenhouse_id,
    temperature_c: telemetry.temperature_c,
    humidity_percent: telemetry.humidity_percent,
    vent_status: telemetry.vent_status ?? "无数据",
    fan_status: telemetry.fan_status ?? "无数据",
  };
}

export function buildGreenhouseDigestMessage(
  slot: GreenhouseDigestSlot,
  deploymentName: string,
  deploymentId: string,
  services: GreenhouseDigestServices,
): string {
  const title = slot === "morning" ? "【晨间简报】" : "【晚间简报】";
  const lines: string[] = [`${title}${deploymentName}`];

  const telemetry = services.getAllTelemetry();
  for (const t of telemetry) {
    const mode = services.getModeByEntityId(t.greenhouse_id);
    const modeHint = mode?.mode === "night_vent" ? `，夜间模式≥${mode.temp_high_c}°C开帘` : "";
    lines.push(
      `${t.greenhouse_id}：${formatGreenhouseMetricValue("temperature_c", t.temperature_c)} / ${formatGreenhouseMetricValue("humidity_percent", t.humidity_percent)}，通风${t.vent_status}，风机${t.fan_status}${modeHint}`,
    );
  }

  if (slot === "morning") {
    const humidGreenhouses = telemetry.filter(
      (t) => t.humidity_percent >= MORNING_DEW_HUMIDITY_THRESHOLD,
    );
    if (humidGreenhouses.length > 0) {
      const scene = resolveSceneForTrigger({
        type: "digest_morning_high_humidity",
      });
      const ids = humidGreenhouses.map((t) => t.greenhouse_id).join("、");
      lines.push(
        `清晨降露建议（${scene ?? "morning_dew_reduction"}）：${ids} 湿度偏高，建议日出后短时通风。`,
      );
    }
  }

  const logs = services.queryLogsToday(deploymentId);
  const completed = logs.filter((l) => l.result === "completed");
  if (completed.length === 0) {
    lines.push("今日操作：暂无记录。");
  } else {
    lines.push(`今日操作：共 ${completed.length} 条。`);
    const preview = completed.slice(-5).map((l) => `${l.ts.slice(11, 16)} ${l.skill}`);
    lines.push(preview.join("；"));
  }

  return lines.join("\n");
}

export const GREENHOUSE_DIGEST: DomainPackDigest = {
  buildMessage({ slot, deploymentName, deploymentId, services }) {
    return buildGreenhouseDigestMessage(slot, deploymentName, deploymentId, {
      getAllTelemetry: () => services.getAllTelemetry().map(toGreenhouseDigestTelemetry),
      getModeByEntityId: services.getModeByEntityId,
      queryLogsToday: (id) =>
        services.queryLogsToday(id) as readonly GreenhouseDigestOperationLog[],
    });
  },
};
