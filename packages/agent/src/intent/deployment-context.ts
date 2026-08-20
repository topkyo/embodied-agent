import { createLogger } from "@embodied-agent/platform";
import type { AgentRuntimeBindings } from "../runtime-bindings.js";
import type { DeploymentContext } from "./prompt.js";

const log = createLogger("agent.intent.deployment-context");

export async function buildDeploymentContext(
  bindings: AgentRuntimeBindings,
): Promise<DeploymentContext> {
  const s = bindings.getEffectiveSettings();
  const registry = bindings.loadRegistry();
  const sceneContext = bindings.buildSceneDeploymentContext(s, registry);

  const ctx: DeploymentContext = {
    ...sceneContext,
  };

  const telemetry = bindings.getAllTelemetry();
  if (telemetry.length > 0) {
    const modesSummary = bindings.buildSceneModesSummary?.(telemetry, (entityId) =>
      bindings.getSceneMode(entityId),
    );
    if (modesSummary) {
      ctx.modes_summary = modesSummary;
    }
  }

  const rules = bindings.listAlertRules();
  if (rules.length > 0) {
    ctx.active_alerts = rules.slice(0, 5).map((r) => {
      const entityId = r.entity_id ?? "deployment";
      return `${entityId} ${r.metric} ${r.operator} ${r.value}`;
    });
  }

  try {
    const coords = bindings.resolveDeploymentCoordinates();
    const forecast = await bindings.fetchWeatherForecast(coords.latitude, coords.longitude, 24);
    ctx.weather_snippet = bindings.formatForecastSnippet(forecast);
  } catch (error) {
    log.warn("坐标未配置时不注入预报", { error });
  }

  return ctx;
}

let contextCache: { at: number; key: string; ctx: DeploymentContext } | undefined;
const CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000;

function contextCacheKey(bindings: AgentRuntimeBindings): string {
  const settings = bindings.getEffectiveSettings();
  return JSON.stringify({
    deployment_id: settings.deployment_id,
    active_domain: settings.active_domain ?? null,
    domain_config:
      settings.active_domain && settings.domain_configs
        ? settings.domain_configs[settings.active_domain]
        : null,
  });
}

export async function buildDeploymentContextCached(
  bindings: AgentRuntimeBindings,
): Promise<DeploymentContext> {
  const key = contextCacheKey(bindings);
  if (
    contextCache &&
    contextCache.key === key &&
    Date.now() - contextCache.at < CONTEXT_CACHE_TTL_MS
  ) {
    return contextCache.ctx;
  }
  const ctx = await buildDeploymentContext(bindings);
  contextCache = { at: Date.now(), key, ctx };
  return ctx;
}

export function clearDeploymentContextCacheForTests(): void {
  contextCache = undefined;
}

export function buildDeploymentContextSync(bindings: AgentRuntimeBindings): DeploymentContext {
  const s = bindings.getEffectiveSettings();
  const registry = bindings.loadRegistry();
  return bindings.buildSceneDeploymentContext(s, registry);
}
