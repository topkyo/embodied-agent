import type { DeviceRegistry, DomainPackAliasIndex, IntentPayload } from "@embodied-agent/core";

const COMPOUND_DEPLOYMENT_WEATHER_RE =
  /(?:大棚|大盘|各棚|所有棚|全场|农场).{0,12}(?:情况|状态|怎么样)|(?:情况|状态|怎么样).{0,12}(?:大棚|大盘)/;

const WEATHER_HINT_RE = /天气|预报|下雨|降水|气温/;

export function buildGreenhouseAliasIndex(
  registry: DeviceRegistry,
  deploymentId: string,
): DomainPackAliasIndex {
  const aliases: DomainPackAliasIndex = {};
  for (const gh of registry.entities) {
    if (
      gh.deployment_id !== deploymentId ||
      gh.domain_id !== "agriculture" ||
      gh.entity_type !== "greenhouse" ||
      gh.status !== "active"
    ) {
      continue;
    }
    aliases[gh.entity_id] = [gh.name, ...(gh.aliases ?? [])].filter(
      (v, idx, arr): v is string => Boolean(v?.trim()) && arr.indexOf(v) === idx,
    );
  }
  if (Object.keys(aliases).length === 0) {
    throw new Error(`部署 ${deploymentId} 未配置可用温室别名。`);
  }
  return aliases;
}

export function isGreenhouseDeploymentWeatherQuery(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return COMPOUND_DEPLOYMENT_WEATHER_RE.test(t) && WEATHER_HINT_RE.test(t);
}

export function buildGreenhouseDeploymentWeatherIntents(
  _deploymentId: string,
): Record<string, IntentPayload> {
  return {
    status: {
      skill: "greenhouse.query_all_status",
      target: {},
      confidence: 1,
    },
    weather: {
      skill: "weather.query_forecast",
      target: {},
      parameters: { hours: 24 },
      confidence: 1,
    },
  };
}
