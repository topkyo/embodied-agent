import type {
  DomainPackSkillHandlerResult,
  IntentPayload,
  SceneModeState,
  SceneTelemetrySlice,
} from "@embodied-agent/core";
import { toGreenhouseTelemetry } from "./telemetry-adapter.js";

type TelemetryServices = {
  getByEntityId?: (entityId: string) => SceneTelemetrySlice | undefined;
  getAll?: () => SceneTelemetrySlice[];
};

type ModeServices = {
  getByEntityId?: (entityId: string) => SceneModeState | undefined | null;
};

const QUERY_SKILLS = new Set(["greenhouse.query_status", "greenhouse.query_all_status"]);

export function canHandleGreenhouseQuerySkill(intent: IntentPayload): boolean {
  return QUERY_SKILLS.has(intent.skill);
}

function telemetryServices(context: { services?: Record<string, unknown> }): TelemetryServices {
  const value = context.services?.telemetry;
  return value && typeof value === "object" ? (value as TelemetryServices) : {};
}

function modeServices(context: { services?: Record<string, unknown> }): ModeServices {
  const value = context.services?.mode;
  return value && typeof value === "object" ? (value as ModeServices) : {};
}

function modeLine(mode: SceneModeState | undefined | null): string {
  return mode?.mode === "night_vent"
    ? `；夜间模式：高于 ${mode.temp_high_c}°C 开帘、低于 ${mode.temp_low_c}°C 关帘${mode.until_iso ? `，至 ${mode.until_iso}` : ""}`
    : "";
}

function actuatorText(value: string | undefined): string {
  return value ?? "无数据";
}

export async function handleGreenhouseQuerySkill(
  intent: IntentPayload,
  context: {
    domainConfig?: unknown;
    deploymentId: string;
    userId?: string;
    services?: Record<string, unknown>;
  },
): Promise<DomainPackSkillHandlerResult> {
  const telemetry = telemetryServices(context);
  const modes = modeServices(context);

  if (intent.skill === "greenhouse.query_status") {
    const target = intent.target as { greenhouse_id?: string };
    const id = target.greenhouse_id as string;
    const raw = telemetry.getByEntityId?.(id);
    if (!raw) {
      return {
        reply: `未找到温室 ${id} 的遥测数据。`,
        params: { entity_id: id },
      };
    }
    const t = toGreenhouseTelemetry(raw);
    const mode = modes.getByEntityId?.(id);
    return {
      reply: `${id} 当前温度 ${t.temperature_c}°C，湿度 ${t.humidity_percent}%，通风 ${actuatorText(t.vent_status)}，风机 ${actuatorText(t.fan_status)}${modeLine(mode)}。`,
      params: { ...t, mode: mode?.mode },
    };
  }

  if (intent.skill === "greenhouse.query_all_status") {
    const all = (telemetry.getAll?.() ?? []).map(toGreenhouseTelemetry);
    if (all.length === 0) {
      return {
        reply: "未找到任何温室遥测数据。",
        params: { deployment_id: context.deploymentId },
      };
    }
    const lines = all.map(
      (t) => `${t.greenhouse_id}: ${t.temperature_c}°C / ${t.humidity_percent}%`,
    );
    return {
      reply: `各棚状态：\n${lines.join("\n")}`,
      params: { deployment_id: context.deploymentId },
    };
  }

  return { reply: "暂不支持该温室查询技能。", params: {} };
}
