import type { IntentPayload } from "@embodied-agent/core";
import { resolveDeploymentCoordinates } from "../../integrations/weather/coordinates.js";
import {
  fetchWeatherForecast,
  formatForecastReply,
  formatWeatherAlerts,
} from "../../integrations/weather/open-meteo.js";
import { getEffectiveSettings } from "../../settings/store.js";
import type { HandlerResult } from "./index.js";

export async function handleWeatherSkill(intent: IntentPayload): Promise<HandlerResult> {
  // LLM 常省略 parameters（如仅返回 skill+confidence）；缺省按 24h
  const params = (intent.parameters ?? {}) as { hours?: number };
  if (intent.skill !== "weather.query_forecast" && intent.skill !== "weather.query_alert") {
    return { reply: "暂不支持该天气技能。", params: {} };
  }

  const coords = resolveDeploymentCoordinates();
  const forecast = await fetchWeatherForecast(coords.latitude, coords.longitude, 48);
  const deployment_id = getEffectiveSettings().deployment_id;

  if (intent.skill === "weather.query_alert") {
    return {
      reply: formatWeatherAlerts(forecast),
      params: { deployment_id, alerts: true },
    };
  }

  const hours =
    typeof params.hours === "number" && Number.isFinite(params.hours) && params.hours > 0
      ? params.hours
      : 24;
  return {
    reply: formatForecastReply(forecast, hours),
    params: {
      deployment_id,
      hours,
      latitude: forecast.latitude,
      longitude: forecast.longitude,
    },
  };
}
