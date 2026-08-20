import { resolve } from "node:path";
import { createLogger } from "@embodied-agent/platform";
import { getEffectiveSettings } from "../settings/store.js";
import { dataRoot } from "../fs/deployment-path.js";

import { refreshNetworkCoordinatesIfNeeded } from "../integrations/weather/geo-locate.js";
import { MqttTelemetrySubscriber } from "../mqtt/telemetry-subscriber.js";
import { MqttEventSubscriber } from "../mqtt/event-subscriber.js";
import { resolveConfiguredMqttUrl } from "../mqtt/url.js";
import { startDigestScheduler } from "../digest/scheduler.js";
import { startWeatherProactiveScheduler } from "../weather/scheduler.js";
import { startNdviScheduler } from "../integrations/satellite/scheduler.js";
import { evaluateAndPushAlerts } from "../alerts/push.js";
import { evaluateSustainedAlerts } from "../alerts/sustained-push.js";
import { evaluateNodeOfflineAlerts } from "../alerts/offline-push.js";
import { tickStatusReportSchedules } from "../report/scheduler.js";
import { getCommandLifecycleWatcher, stopCommandLifecycleWatcher } from "../commands/watcher.js";
import { recoverStalePromoteStaging } from "@embodied-agent/agent";
import { getAgentRuntimeContext } from "../runtime/agent-context.js";
import { tickOutcomeScheduler } from "../scene/outcome-scheduler.js";
import { hasActiveProactiveAlerts } from "@embodied-agent/runtime";
import { stopDomainCapabilitySchedulers } from "./domain-schedulers.js";
import { runDataRetentionPass } from "./retention.js";
import { FileLockBusyError, withFileLock } from "../fs/file-lock.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";
import type { MqttContext } from "@embodied-agent/node";

const log = createLogger("jobs");
let telemetrySub: MqttTelemetrySubscriber | null = null;
let eventSub: MqttEventSubscriber | null = null;
let alertPollTimer: ReturnType<typeof setInterval> | null = null;
let retentionTimer: ReturnType<typeof setInterval> | null = null;

function mqttSubscribeAttempts(): number {
  const raw = Number.parseInt(process.env.MQTT_SUBSCRIBE_CONNECT_ATTEMPTS ?? "", 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return process.env.FLYWHEEL_DEV === "1" ? 20 : 5;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** alert-poll 协调锁路径：归入 AGENT_DATA_DIR，避免按进程 cwd 落盘导致多实例互斥失效。 */
export function alertPollLockPath(): string {
  return resolve(dataRoot(), "jobs", "alert-poll", `${getEffectiveSettings().deployment_id}.lock`);
}

export async function runAlertPollTick(): Promise<void> {
  try {
    await withFileLock(alertPollLockPath(), async () => {
      if (hasActiveProactiveAlerts(getPlatformRuntimeContext())) {
        await evaluateSustainedAlerts();
      }
      await evaluateAndPushAlerts();
      await evaluateNodeOfflineAlerts();
      await tickStatusReportSchedules();
      try {
        tickOutcomeScheduler([getEffectiveSettings().deployment_id]);
      } catch (err) {
        log.warn("scene outcome scheduler error", { error: String(err) });
      }
    });
  } catch (error) {
    if (error instanceof FileLockBusyError) return;
    throw error;
  }
}

async function connectMqttSubscriber<
  T extends { connect(): Promise<void>; disconnect(): Promise<void> },
>(label: string, create: () => T): Promise<T | null> {
  const attempts = mqttSubscribeAttempts();
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const subscriber = create();
    try {
      await subscriber.connect();
      return subscriber;
    } catch (err) {
      lastError = err;
      await subscriber.disconnect().catch((err) => {
        log.debug("subscriber disconnect failed on retry", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
      if (attempt < attempts) {
        await delay(500);
      }
    }
  }
  log.warn(`${label} subscribe failed`, {
    attempts,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  return null;
}

export async function startBackgroundJobs(mqttCtx: MqttContext): Promise<void> {
  recoverStalePromoteStaging(getAgentRuntimeContext().bindings);
  await refreshNetworkCoordinatesIfNeeded();
  startDigestScheduler();
  startWeatherProactiveScheduler();
  startNdviScheduler();

  const mqttUrl = resolveConfiguredMqttUrl();
  if (mqttUrl) {
    // 启动时主动连 publisher：避免 watcher 仅 get() 未 connect 时 readiness 报「消息通道未连通」
    try {
      await mqttCtx.publisher.get(mqttUrl).connect();
      log.info("MQTT publisher connected", { broker: mqttUrl });
    } catch (err) {
      log.warn("MQTT publisher connect failed", {
        broker: mqttUrl,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    telemetrySub = await connectMqttSubscriber(
      "MQTT telemetry",
      () => new MqttTelemetrySubscriber(mqttUrl),
    );
    eventSub = await connectMqttSubscriber(
      "MQTT command event",
      () => new MqttEventSubscriber(mqttUrl, mqttCtx),
    );
  }

  const alertPollMs =
    process.env.FLYWHEEL_DEV === "1" && process.env.FLYWHEEL_FAST !== "0" ? 10_000 : 60_000;

  alertPollTimer = setInterval(() => {
    void runAlertPollTick().catch((err) => {
      log.warn("alert poll error", { error: String(err) });
    });
  }, alertPollMs);

  void runAlertPollTick().catch((err) => {
    log.warn("alert initial fire error", { error: String(err) });
  });
  getCommandLifecycleWatcher(mqttCtx).start();
  if (process.env.RETENTION_DAYS?.trim()) {
    runDataRetentionPass();
    retentionTimer = setInterval(
      () => {
        try {
          runDataRetentionPass();
        } catch (err) {
          log.warn("retention pass error", { error: String(err) });
        }
      },
      6 * 60 * 60 * 1000,
    );
  }
  log.info("background jobs started");
}

export async function restartMqttSubscribers(mqttCtx: MqttContext): Promise<void> {
  await telemetrySub?.disconnect();
  telemetrySub = null;
  await eventSub?.disconnect();
  eventSub = null;
  const mqttUrl = resolveConfiguredMqttUrl();
  if (!mqttUrl) return;
  telemetrySub = await connectMqttSubscriber(
    "MQTT telemetry",
    () => new MqttTelemetrySubscriber(mqttUrl),
  );
  eventSub = await connectMqttSubscriber(
    "MQTT command event",
    () => new MqttEventSubscriber(mqttUrl, mqttCtx),
  );
}

export async function stopBackgroundJobs(): Promise<void> {
  stopCommandLifecycleWatcher();
  stopDomainCapabilitySchedulers();
  if (alertPollTimer) clearInterval(alertPollTimer);
  alertPollTimer = null;
  if (retentionTimer) clearInterval(retentionTimer);
  retentionTimer = null;
  await telemetrySub?.disconnect();
  telemetrySub = null;
  await eventSub?.disconnect();
  eventSub = null;
  log.info("background jobs stopped");
}
