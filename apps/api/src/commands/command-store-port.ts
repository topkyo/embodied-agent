import type { CommandEvent, CommandMessage } from "@embodied-agent/core";
import { currentDeploymentId } from "../fs/deployment-path.js";
import type { CommandLifecycleStatus, CommandRecord } from "./types.js";
import { IN_FLIGHT_COMMAND_STATUSES } from "./types.js";
import type { TelemetrySnapshot } from "./telemetry-snapshot.js";
import { captureTelemetrySnapshot, entityIdFromDevice } from "./telemetry-snapshot.js";
import { dispatchTerminalCommandHooks } from "../scene/terminal-hooks.js";
import { commandEventMatchesRecord } from "./event-identity.js";
import { canApplyCommandEvent, TERMINAL_STATUSES } from "./store-transitions.js";

export type CommandLookupOpts = {
  action?: string;
  entity_id?: string;
  limit?: number;
};

/** Storage primitives implemented by file or sqlite backends. */
export interface CommandStorePort {
  getRecord(command_id: string, deployment_id: string): CommandRecord | undefined;
  listRecords(deployment_id: string): readonly CommandRecord[];
  upsertRecord(record: CommandRecord): void;
  clearDeployment(deployment_id: string): void;
}

function resolveDeploymentId(deployment_id?: string): string {
  return deployment_id?.trim() || currentDeploymentId();
}

export function createCommandStoreApi(port: CommandStorePort) {
  function getRecordInDeployment(
    deployment_id: string,
    command_id: string,
  ): CommandRecord | undefined {
    return port.getRecord(command_id, resolveDeploymentId(deployment_id));
  }

  function createCommand(
    command: CommandMessage,
    opts?: {
      telemetry_before?: TelemetrySnapshot;
      scene_skill_id?: string;
      risk_level?: string;
      user_confirmed?: boolean;
    },
  ): CommandRecord {
    const now = new Date().toISOString();
    const record: CommandRecord = {
      command_id: command.command_id,
      command,
      status: "created",
      created_at: now,
      updated_at: now,
      telemetry_flywheel: opts?.telemetry_before ? { before: opts.telemetry_before } : undefined,
      scene_skill_id: opts?.scene_skill_id,
      risk_level: opts?.risk_level,
      user_confirmed: opts?.user_confirmed,
    };
    port.upsertRecord(record);
    return record;
  }

  function attachCommandTelemetryAfter(
    command_id: string,
    after: TelemetrySnapshot,
    deployment_id = currentDeploymentId(),
  ): CommandRecord | undefined {
    const fid = resolveDeploymentId(deployment_id);
    const record = getRecordInDeployment(fid, command_id);
    if (!record) return undefined;
    record.telemetry_flywheel = { ...record.telemetry_flywheel, after };
    record.updated_at = new Date().toISOString();
    port.upsertRecord(record);
    return record;
  }

  function attachCommandTelemetryWindow(
    command_id: string,
    minutes: number,
    snapshot: TelemetrySnapshot,
    deployment_id = currentDeploymentId(),
  ): CommandRecord | undefined {
    const fid = resolveDeploymentId(deployment_id);
    const record = getRecordInDeployment(fid, command_id);
    if (!record) return undefined;
    const windows = [...(record.telemetry_flywheel?.windows ?? [])];
    const idx = windows.findIndex((w) => w.minutes === minutes);
    const row = {
      minutes,
      snapshot,
      captured_at: new Date().toISOString(),
    };
    if (idx >= 0) windows[idx] = row;
    else windows.push(row);
    record.telemetry_flywheel = { ...record.telemetry_flywheel, windows };
    record.updated_at = new Date().toISOString();
    port.upsertRecord(record);
    return record;
  }

  function markCommandExecutionSource(
    command_id: string,
    source: {
      execution_transport: string;
      lifecycle_source: NonNullable<CommandRecord["lifecycle_source"]>;
    },
    deployment_id = currentDeploymentId(),
  ): CommandRecord | undefined {
    const fid = resolveDeploymentId(deployment_id);
    const record = getRecordInDeployment(fid, command_id);
    if (!record) return undefined;
    record.execution_transport = source.execution_transport;
    record.lifecycle_source = source.lifecycle_source;
    record.updated_at = new Date().toISOString();
    port.upsertRecord(record);
    return record;
  }

  function markCommandSent(
    command_id: string,
    deployment_id = currentDeploymentId(),
  ): CommandRecord | undefined {
    const fid = resolveDeploymentId(deployment_id);
    const record = getRecordInDeployment(fid, command_id);
    if (!record || TERMINAL_STATUSES.has(record.status)) return undefined;
    const now = new Date().toISOString();
    record.status = "sent";
    record.sent_at = now;
    record.updated_at = now;
    port.upsertRecord(record);
    return record;
  }

  function markCommandFailed(
    command_id: string,
    error: { code: string; message: string },
    deployment_id = currentDeploymentId(),
  ): CommandRecord | undefined {
    const fid = resolveDeploymentId(deployment_id);
    const record = getRecordInDeployment(fid, command_id);
    if (!record || TERMINAL_STATUSES.has(record.status)) return undefined;
    record.status = "failed";
    record.error = error;
    record.updated_at = new Date().toISOString();
    port.upsertRecord(record);
    dispatchTerminalCommandHooks(record);
    return record;
  }

  function markCommandTimeout(
    command_id: string,
    deployment_id = currentDeploymentId(),
  ): CommandRecord | undefined {
    const fid = resolveDeploymentId(deployment_id);
    const record = getRecordInDeployment(fid, command_id);
    if (!record || record.status !== "sent") return undefined;
    record.status = "timeout";
    record.error = {
      code: "ack_timeout",
      message: "设备在约定时间内未确认指令",
    };
    record.updated_at = new Date().toISOString();
    port.upsertRecord(record);
    dispatchTerminalCommandHooks(record);
    return record;
  }

  function recordConfigSyncAttempt(
    command_id: string,
    deployment_id = currentDeploymentId(),
  ): CommandRecord | undefined {
    const fid = resolveDeploymentId(deployment_id);
    const record = getRecordInDeployment(fid, command_id);
    if (!record || TERMINAL_STATUSES.has(record.status)) return undefined;
    record.config_sync_fail_count = (record.config_sync_fail_count ?? 0) + 1;
    record.updated_at = new Date().toISOString();
    port.upsertRecord(record);
    return record;
  }

  function patchCommandConfigVersion(
    command_id: string,
    config_version: number,
    deployment_id = currentDeploymentId(),
  ): CommandRecord | undefined {
    const fid = resolveDeploymentId(deployment_id);
    const record = getRecordInDeployment(fid, command_id);
    if (!record) return undefined;
    record.command = { ...record.command, config_version };
    record.updated_at = new Date().toISOString();
    port.upsertRecord(record);
    return record;
  }

  function recordCommandRetry(
    command_id: string,
    deployment_id = currentDeploymentId(),
  ): CommandRecord | undefined {
    const fid = resolveDeploymentId(deployment_id);
    const record = getRecordInDeployment(fid, command_id);
    if (!record || record.status !== "sent") return undefined;
    const now = new Date().toISOString();
    record.retry_count = (record.retry_count ?? 0) + 1;
    record.last_retry_at = now;
    record.updated_at = now;
    port.upsertRecord(record);
    return record;
  }

  function markCommandNotified(
    command_id: string,
    status: CommandLifecycleStatus,
    deployment_id = currentDeploymentId(),
  ): CommandRecord | undefined {
    const fid = resolveDeploymentId(deployment_id);
    const record = getRecordInDeployment(fid, command_id);
    if (!record) return undefined;
    record.notified_status = status;
    record.updated_at = new Date().toISOString();
    port.upsertRecord(record);
    return record;
  }

  function applyCommandEvent(event: CommandEvent): CommandRecord | undefined {
    const fid = resolveDeploymentId(event.deployment_id);
    const record = port.getRecord(event.command_id, fid);
    if (!record) return undefined;
    if (!commandEventMatchesRecord(event, record)) return undefined;
    if (!canApplyCommandEvent(record.status, event.status)) return record;
    const previous = record.status;
    record.status = event.status as CommandLifecycleStatus;
    record.last_event_at = event.occurred_at;
    record.updated_at = new Date().toISOString();
    if (event.error?.code && event.error.message) {
      record.error = { code: event.error.code, message: event.error.message };
    } else if (previous !== record.status) {
      delete record.error;
    }
    if (event.result) record.result = event.result;
    if (event.status === "completed") {
      const entityId = entityIdFromDevice(fid, record.command.device_id);
      if (entityId) {
        const snap = captureTelemetrySnapshot(entityId, fid);
        if (snap) attachCommandTelemetryAfter(event.command_id, snap, fid);
      }
    }
    port.upsertRecord(record);
    dispatchTerminalCommandHooks(record);
    return record;
  }

  function getCommand(
    command_id: string,
    deployment_id = currentDeploymentId(),
  ): CommandRecord | undefined {
    return getRecordInDeployment(deployment_id, command_id);
  }

  function listCommands(deployment_id = currentDeploymentId()): readonly CommandRecord[] {
    return port.listRecords(resolveDeploymentId(deployment_id));
  }

  function getRecentCommandForUser(user_id: string): CommandRecord | undefined {
    return findCommandsForUser(user_id, { limit: 1 })[0];
  }

  function findCommandsForUser(
    user_id: string,
    opts?: CommandLookupOpts,
    deployment_id = currentDeploymentId(),
  ): CommandRecord[] {
    let rows = port
      .listRecords(resolveDeploymentId(deployment_id))
      .filter((r) => r.command.issued_by.user_id === user_id);
    if (opts?.action) {
      rows = rows.filter((r) => r.command.action === opts.action);
    }
    if (opts?.entity_id) {
      rows = rows.filter((r) => r.command.entity_id === opts.entity_id);
    }
    const limit = opts?.limit ?? 1;
    return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, limit);
  }

  function listAwaitingAckCommands(
    deployment_id = currentDeploymentId(),
  ): readonly CommandRecord[] {
    return port
      .listRecords(resolveDeploymentId(deployment_id))
      .filter((r) => r.status === "sent" && r.sent_at);
  }

  function listUnsentCommands(deployment_id = currentDeploymentId()): readonly CommandRecord[] {
    return port
      .listRecords(resolveDeploymentId(deployment_id))
      .filter((r) => r.status === "created");
  }

  function getRunningActionForDevice(
    device_id: string,
    deployment_id = currentDeploymentId(),
  ): "open" | "close" | "start" | null {
    for (const record of port.listRecords(resolveDeploymentId(deployment_id))) {
      if (record.command.device_id !== device_id) continue;
      if (record.status !== "running") continue;
      const action = record.command.action;
      if (action === "open" || action === "close" || action === "start") {
        return action;
      }
    }
    return null;
  }

  function getInFlightCommandForDevice(opts: {
    deploymentId: string;
    deviceId: string;
  }): CommandRecord | undefined {
    const deployment_id = resolveDeploymentId(opts.deploymentId);
    const records = port
      .listRecords(deployment_id)
      .filter(
        (r) => r.command.device_id === opts.deviceId && IN_FLIGHT_COMMAND_STATUSES.has(r.status),
      );
    if (records.length === 0) return undefined;
    records.sort((a, b) => {
      const timeCmp = b.updated_at.localeCompare(a.updated_at);
      if (timeCmp !== 0) return timeCmp;
      const createdCmp = b.created_at.localeCompare(a.created_at);
      if (createdCmp !== 0) return createdCmp;
      return b.command_id.localeCompare(a.command_id);
    });
    return records[0];
  }

  function clearCommands(deployment_id = currentDeploymentId()): void {
    port.clearDeployment(resolveDeploymentId(deployment_id));
  }

  return {
    createCommand,
    attachCommandTelemetryAfter,
    attachCommandTelemetryWindow,
    markCommandExecutionSource,
    markCommandSent,
    markCommandFailed,
    markCommandTimeout,
    recordConfigSyncAttempt,
    patchCommandConfigVersion,
    recordCommandRetry,
    markCommandNotified,
    applyCommandEvent,
    getCommand,
    listCommands,
    getRecentCommandForUser,
    findCommandsForUser,
    listAwaitingAckCommands,
    listUnsentCommands,
    getRunningActionForDevice,
    getInFlightCommandForDevice,
    clearCommands,
  };
}

export type CommandStoreApi = ReturnType<typeof createCommandStoreApi>;
