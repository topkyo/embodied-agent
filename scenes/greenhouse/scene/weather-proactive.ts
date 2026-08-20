import type {
  DomainPackWeatherAlert,
  DomainPackWeatherProactive,
  IntentPayload,
  SceneTelemetrySlice,
} from "@embodied-agent/core";
import { resolveSceneForTrigger } from "./registry.js";

export type GreenhouseWeatherColdAlert = {
  message: string;
  min_temp_c: number;
};

export type GreenhouseWeatherHeatAlert = {
  message: string;
  max_temp_c: number;
};

export type GreenhouseWeatherTelemetry = {
  greenhouse_id: string;
  temperature_c: number;
};

export type GreenhouseWeatherProactivePlan = {
  templateText: string;
  data: Record<string, unknown>;
  sceneSkillId?: string;
  pendingIntent?: IntentPayload;
};

function nightVentIntent(greenhouseId: string, maxTemp: number): IntentPayload {
  return {
    skill: "greenhouse.set_mode",
    target: { greenhouse_id: greenhouseId },
    parameters: {
      mode: "night_vent",
      max_temp_c: maxTemp,
      temp_low_c: Math.max(maxTemp - 2, 0),
    },
    confidence: 0.95,
  };
}

function hottestGreenhouse(
  telemetry: readonly GreenhouseWeatherTelemetry[],
): GreenhouseWeatherTelemetry | undefined {
  return [...telemetry].sort((a, b) => b.temperature_c - a.temperature_c)[0];
}

export function buildGreenhouseColdWeatherPlan(
  alert: GreenhouseWeatherColdAlert,
): GreenhouseWeatherProactivePlan {
  return {
    templateText: `【天气预警】${alert.message} 请检查保温被与卷膜，白天回暖后再分步通风。`,
    data: { min_temp_c: alert.min_temp_c },
    sceneSkillId: resolveSceneForTrigger({ type: "weather_cold" }) ?? undefined,
  };
}

export function buildGreenhouseHeatWeatherPlan(
  alert: GreenhouseWeatherHeatAlert,
  telemetry: readonly GreenhouseWeatherTelemetry[],
): GreenhouseWeatherProactivePlan {
  const hottest = hottestGreenhouse(telemetry);
  return {
    templateText:
      `【高温预警】${alert.message} 建议关注棚内通风与遮阳。` +
      "可为最热棚预置夜间通风模式，回复「确认」执行。",
    data: { max_temp_c: alert.max_temp_c },
    sceneSkillId: resolveSceneForTrigger({ type: "weather_heat_l2" }) ?? undefined,
    pendingIntent: hottest ? nightVentIntent(hottest.greenhouse_id, 32) : undefined,
  };
}

function coldAlertFrom(input: DomainPackWeatherAlert): GreenhouseWeatherColdAlert {
  if (typeof input.min_temp_c !== "number") {
    throw new Error("greenhouse cold weather alert 缺少 min_temp_c。");
  }
  return {
    message: input.message,
    min_temp_c: input.min_temp_c,
  };
}

function heatAlertFrom(input: DomainPackWeatherAlert): GreenhouseWeatherHeatAlert {
  if (typeof input.max_temp_c !== "number") {
    throw new Error("greenhouse heat weather alert 缺少 max_temp_c。");
  }
  return {
    message: input.message,
    max_temp_c: input.max_temp_c,
  };
}

function toGreenhouseWeatherTelemetry(slice: SceneTelemetrySlice): GreenhouseWeatherTelemetry {
  if (typeof slice.temperature_c !== "number") {
    throw new Error(`greenhouse weather telemetry 字段不完整：${slice.entity_id}`);
  }
  return {
    greenhouse_id: slice.entity_id,
    temperature_c: slice.temperature_c,
  };
}

export const GREENHOUSE_WEATHER_PROACTIVE: DomainPackWeatherProactive = {
  buildColdPlan(alert) {
    return {
      kind: "weather_cold",
      ...buildGreenhouseColdWeatherPlan(coldAlertFrom(alert)),
    };
  },
  buildHeatPlan({ alert, telemetry }) {
    return {
      kind: "weather_heat",
      ...buildGreenhouseHeatWeatherPlan(
        heatAlertFrom(alert),
        telemetry.map(toGreenhouseWeatherTelemetry),
      ),
    };
  },
  buildFlywheelHeatFallbackTelemetry({ deployment_id, primary_metric_value, entities }) {
    return entities
      .filter(
        (entity) =>
          entity.deployment_id === deployment_id &&
          entity.status === "active" &&
          entity.entity_type === "greenhouse",
      )
      .map((entity) => ({
        entity_id: entity.entity_id,
        temperature_c: primary_metric_value,
      }));
  },
};
