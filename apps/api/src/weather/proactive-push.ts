import { createLogger } from "@embodied-agent/platform";

import { resolveDeploymentCoordinates } from "../integrations/weather/coordinates.js";
import {
  detectColdWaveAlert,
  detectHeatAlert,
  fetchWeatherForecast,
} from "../integrations/weather/open-meteo.js";
import { getEffectiveSettings } from "../settings/store.js";
import { digestRecipientsForDeployment } from "../notifications/recipients.js";
import { proactiveWechatSendReady, isFlywheelDevBypass } from "../wechat/outbound.js";
import { defaultProactiveSend } from "../channels/proactive-send.js";
import { setPendingConfirm } from "../policy/pending-confirm.js";
import { renderProactiveSummary } from "../nlg/render-reply.js";
import { getAllTelemetry } from "../telemetry/store.js";
import { activeWeatherProactive, hasActiveWeatherProactive } from "@embodied-agent/runtime";
import type { SceneTelemetrySlice } from "@embodied-agent/core";
import { loadRegistry } from "@embodied-agent/node";
import { getPlatformRuntimeContext } from "../runtime/context.js";

const log = createLogger("weather-proactive");
const sentKeys = new Set<string>();

export type WeatherProactiveOpts = {
  forceCold?: boolean;
  forceHeat?: boolean;
};

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getSceneTelemetry(deploymentId: string): SceneTelemetrySlice[] {
  return getAllTelemetry(deploymentId).map((t) => ({ ...t, entity_id: t.entity_id }));
}

function forcedHeatFallbackTelemetry(
  weatherProactive: NonNullable<ReturnType<typeof activeWeatherProactive>>,
  deploymentId: string,
  primary_metric_value: number,
): SceneTelemetrySlice[] {
  const builder = weatherProactive.buildFlywheelHeatFallbackTelemetry;
  if (!builder) {
    throw new Error(
      "当前 Domain Pack 的 weatherProactive 未提供 buildFlywheelHeatFallbackTelemetry。",
    );
  }
  return [
    ...builder({
      deployment_id: deploymentId,
      primary_metric_value,
      entities: loadRegistry().entities,
    }),
  ];
}

export async function evaluateWeatherProactivePush(opts: WeatherProactiveOpts = {}): Promise<{
  cold: number;
  heat: number;
}> {
  const settings = getEffectiveSettings();
  if (!hasActiveWeatherProactive(getPlatformRuntimeContext())) return { cold: 0, heat: 0 };
  if (settings.weather_proactive_enabled === false) return { cold: 0, heat: 0 };
  if (settings.alert_push_enabled === false) return { cold: 0, heat: 0 };
  if (!proactiveWechatSendReady()) return { cold: 0, heat: 0 };
  const weatherProactive = activeWeatherProactive(getPlatformRuntimeContext());
  if (!weatherProactive) {
    throw new Error("当前 Domain Pack 未提供 weatherProactive。");
  }

  const forceCold = opts.forceCold === true;
  const forceHeat = opts.forceHeat === true;
  const flywheelForce = isFlywheelDevBypass() && (forceCold || forceHeat);

  let cold = null as ReturnType<typeof detectColdWaveAlert>;
  let heat = null as ReturnType<typeof detectHeatAlert>;
  if (!flywheelForce) {
    let coords;
    try {
      coords = resolveDeploymentCoordinates();
    } catch {
      return { cold: 0, heat: 0 };
    }
    const forecast = await fetchWeatherForecast(coords.latitude, coords.longitude, 48);
    cold = detectColdWaveAlert(forecast);
    heat = detectHeatAlert(forecast);
  }
  if (isFlywheelDevBypass() && forceCold) {
    cold = {
      active: true,
      message: "飞轮联调：寒潮预警模拟",
      min_temp_c: -2,
    };
  }
  if (isFlywheelDevBypass() && forceHeat) {
    heat = {
      active: true,
      message: "飞轮联调：高温预警模拟",
      max_temp_c: 38,
    };
  }
  const skipDedup = flywheelForce;
  const recipients = digestRecipientsForDeployment(settings.deployment_id);
  let coldCount = 0;
  let heatCount = 0;

  if (cold?.active) {
    const key = `weather-cold:${dayKey()}`;
    if (skipDedup || !sentKeys.has(key)) {
      const plan = weatherProactive.buildColdPlan(cold);
      const message = await renderProactiveSummary({
        kind: plan.kind,
        templateText: plan.templateText,
        data: plan.data,
      });
      for (const r of recipients) {
        if (await defaultProactiveSend(r.platform_user_id, message)) {
          if (plan.sceneSkillId) {
            log.info("cold proactive sent", {
              scene: plan.sceneSkillId,
              user_id: r.principal_user_id,
            });
          }
          coldCount += 1;
        }
      }
      if (!skipDedup) sentKeys.add(key);
    }
  }

  if (heat?.active) {
    const key = `weather-heat:${dayKey()}`;
    if (skipDedup || !sentKeys.has(key)) {
      let telemetry = getSceneTelemetry(settings.deployment_id);
      if (flywheelForce && forceHeat && telemetry.length === 0) {
        telemetry = forcedHeatFallbackTelemetry(
          weatherProactive,
          settings.deployment_id,
          heat.max_temp_c,
        );
      }
      const plan = weatherProactive.buildHeatPlan({
        alert: heat,
        telemetry,
      });
      const message = await renderProactiveSummary({
        kind: plan.kind,
        templateText: plan.templateText,
        data: plan.data,
      });
      for (const r of recipients) {
        if (await defaultProactiveSend(r.platform_user_id, message)) {
          if (plan.pendingIntent) {
            setPendingConfirm({
              intent: plan.pendingIntent,
              user_id: r.principal_user_id,
              conversation_id: r.platform_user_id,
              model: settings.llm_model,
              scene_skill_id: plan.sceneSkillId,
            });
          }
          heatCount += 1;
        }
      }
      if (!skipDedup) sentKeys.add(key);
    }
  }

  return { cold: coldCount, heat: heatCount };
}

export function clearWeatherProactiveKeysForTests(): void {
  sentKeys.clear();
}
