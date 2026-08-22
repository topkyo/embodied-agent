import type { IntentPayload } from "@embodied-agent/core";
import {
  buildActiveDomainCompoundQueryIntents,
  matchActiveDomainCompoundQuery,
} from "@embodied-agent/runtime";
import { getPlatformRuntimeContext } from "../runtime/context.js";

export function isCompoundDeploymentWeatherQuery(text: string): boolean {
  return matchActiveDomainCompoundQuery(getPlatformRuntimeContext(), text);
}

export function buildCompoundDeploymentWeatherIntents(_deployment_id: string): {
  status: IntentPayload;
  weather: IntentPayload;
} {
  const intents = buildActiveDomainCompoundQueryIntents(getPlatformRuntimeContext());
  const status = intents.status;
  const weather = intents.weather;
  if (!status || !weather) {
    throw new Error("当前 Domain Pack 未提供 status/weather 复合查询 intent。");
  }
  return { status, weather };
}
