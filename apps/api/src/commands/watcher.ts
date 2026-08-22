import { commandAckTimeoutMs, commandMaxRetries, commandRetryIntervalMs } from "./config.js";
import {
  listAwaitingAckCommands,
  listUnsentCommands,
  markCommandFailed,
  markCommandSent,
  markCommandTimeout,
  patchCommandConfigVersion,
  recordCommandRetry,
  recordConfigSyncAttempt,
} from "./store.js";
import { prepareCommandForPublish, WATCHER_CONFIG_WAIT_MS } from "@embodied-agent/node";
import type { PrepareCommandResult } from "@embodied-agent/node";
import type { CommandRecord } from "./types.js";
import { notifyCommandStatusChange } from "./notify.js";
import { createLogger } from "@embodied-agent/platform";
import { getEffectiveSettings } from "../settings/store.js";
import { resolveConfiguredMqttUrl } from "../mqtt/url.js";
import type { MqttCommandPublisher, MqttContext } from "@embodied-agent/node";
import { assertDispatchableCommand, type DispatchabilityResult } from "@embodied-agent/runtime";
import { getPlatformRuntimeContext } from "../runtime/context.js";

const log = createLogger("command-watcher");

export type AwaitingAckAction = "noop" | "retry" | "timeout";

export const CONFIG_SYNC_MAX_ATTEMPTS = 30;

function watcherDeploymentIds(): string[] {
  return [getEffectiveSettings().deployment_id].filter(Boolean);
}

export function isTransientConfigError(code: string): boolean {
  return code === "config_not_ready";
}

export function evaluateAwaitingAckAction(
  record: CommandRecord,
  now: number,
  opts?: {
    ackTimeoutMs?: number;
    retryIntervalMs?: number;
    maxRetries?: number;
  },
): AwaitingAckAction {
  if (record.status !== "sent" || !record.sent_at) return "noop";
  const sentAt = new Date(record.sent_at).getTime();
  const elapsed = now - sentAt;
  const ackTimeoutMs = opts?.ackTimeoutMs ?? commandAckTimeoutMs();
  const retryIntervalMs = opts?.retryIntervalMs ?? commandRetryIntervalMs();
  const maxRetries = opts?.maxRetries ?? commandMaxRetries();
  const retries = record.retry_count ?? 0;

  if (elapsed >= ackTimeoutMs) return "timeout";
  if (retries >= maxRetries) return "noop";
  const retryDueInMs = retryIntervalMs * (retries + 1);
  return elapsed >= retryDueInMs ? "retry" : "noop";
}

async function failCommandConfigSync(
  record: CommandRecord,
  prepared: Extract<PrepareCommandResult, { ok: false }>,
): Promise<void> {
  const failed = markCommandFailed(
    record.command_id,
    { code: prepared.code, message: prepared.message },
    record.command.deployment_id,
  );
  if (failed) void notifyCommandStatusChange(failed);
}

async function failCommandDispatchability(
  record: CommandRecord,
  dispatchable: Extract<DispatchabilityResult, { ok: false }>,
): Promise<void> {
  const failed = markCommandFailed(
    record.command_id,
    { code: dispatchable.code, message: dispatchable.reason },
    record.command.deployment_id,
  );
  if (failed) void notifyCommandStatusChange(failed);
}

export async function rejectNonDispatchableWatcherCommand(record: CommandRecord): Promise<boolean> {
  const dispatchable = assertDispatchableCommand(getPlatformRuntimeContext(), record.command);
  if (dispatchable.ok) return false;
  await failCommandDispatchability(record, dispatchable);
  return true;
}

async function handleConfigPrepareFailure(
  record: CommandRecord,
  prepared: Extract<PrepareCommandResult, { ok: false }>,
): Promise<void> {
  if (isTransientConfigError(prepared.code)) {
    const updated = recordConfigSyncAttempt(record.command_id, record.command.deployment_id);
    if (updated && (updated.config_sync_fail_count ?? 0) >= CONFIG_SYNC_MAX_ATTEMPTS) {
      await failCommandConfigSync(record, prepared);
    }
    return;
  }
  await failCommandConfigSync(record, prepared);
}

async function publishPreparedCommand(
  record: CommandRecord,
  mqtt: MqttCommandPublisher,
): Promise<void> {
  if (await rejectNonDispatchableWatcherCommand(record)) {
    return;
  }
  const prepared = await prepareCommandForPublish(record.command, mqtt, {
    waitMs: WATCHER_CONFIG_WAIT_MS,
  });
  if (!prepared.ok) {
    await handleConfigPrepareFailure(record, prepared);
    return;
  }
  patchCommandConfigVersion(
    record.command_id,
    prepared.config_version,
    record.command.deployment_id,
  );
  await mqtt.publishCommand(prepared.command);
}

export class CommandLifecycleWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly mqttCtx: MqttContext) {}

  start(intervalMs = 1000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick().catch((err) => {
        log.error("command lifecycle tick failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(now = Date.now()): Promise<void> {
    const mqttUrl = resolveConfiguredMqttUrl();
    if (!mqttUrl) return;

    const mqtt = this.mqttCtx.publisher.get(mqttUrl);

    for (const deploymentId of watcherDeploymentIds()) {
      for (const record of listUnsentCommands(deploymentId)) {
        try {
          if (await rejectNonDispatchableWatcherCommand(record)) {
            continue;
          }
          const prepared = await prepareCommandForPublish(record.command, mqtt, {
            waitMs: WATCHER_CONFIG_WAIT_MS,
          });
          if (!prepared.ok) {
            await handleConfigPrepareFailure(record, prepared);
            continue;
          }
          patchCommandConfigVersion(
            record.command_id,
            prepared.config_version,
            record.command.deployment_id,
          );
          await mqtt.publishCommand(prepared.command);
          markCommandSent(record.command_id, record.command.deployment_id);
        } catch (err) {
          // 发布失败保持 unsent，下一 tick 重试；但必须可观测。
          log.warn("command publish failed, will retry next tick", {
            command_id: record.command_id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    for (const deploymentId of watcherDeploymentIds()) {
      for (const record of listAwaitingAckCommands(deploymentId)) {
        if (await rejectNonDispatchableWatcherCommand(record)) {
          continue;
        }
        const action = evaluateAwaitingAckAction(record, now);
        if (action === "timeout") {
          const timedOut = markCommandTimeout(record.command_id, record.command.deployment_id);
          if (timedOut) void notifyCommandStatusChange(timedOut);
          continue;
        }
        if (action !== "retry") continue;

        try {
          await publishPreparedCommand(record, mqtt);
          recordCommandRetry(record.command_id, record.command.deployment_id);
        } catch (err) {
          // 保持 sent 状态；下一 tick 可能重试或超时，但失败必须可观测。
          log.warn("command retry publish failed", {
            command_id: record.command_id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }
}

let sharedWatcher: CommandLifecycleWatcher | null = null;

export function getCommandLifecycleWatcher(mqttCtx: MqttContext): CommandLifecycleWatcher {
  if (!sharedWatcher) sharedWatcher = new CommandLifecycleWatcher(mqttCtx);
  return sharedWatcher;
}

export function stopCommandLifecycleWatcher(): void {
  sharedWatcher?.stop();
  sharedWatcher = null;
}
