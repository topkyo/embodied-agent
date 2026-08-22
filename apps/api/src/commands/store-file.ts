import { createLogger } from "@embodied-agent/platform";
import { currentDeploymentId } from "../fs/deployment-path.js";
import { getMemoryJournal } from "../memory/journal.js";
import type { CommandRecord } from "./types.js";
import { createCommandStoreApi, type CommandStorePort } from "./command-store-port.js";

export { canApplyCommandEvent } from "./store-transitions.js";
export type { CommandLookupOpts } from "./command-store-port.js";

const log = createLogger("command-store-file");

const commandsByDeployment = new Map<string, Map<string, CommandRecord>>();
const hydratedDeployments = new Set<string>();

function resolveDeploymentId(deployment_id?: string): string {
  return deployment_id?.trim() || currentDeploymentId();
}

function commandsForDeployment(deployment_id: string): Map<string, CommandRecord> {
  hydrate(deployment_id);
  let map = commandsByDeployment.get(deployment_id);
  if (!map) {
    map = new Map();
    commandsByDeployment.set(deployment_id, map);
  }
  return map;
}

function hydrate(deployment_id = currentDeploymentId()): void {
  const fid = resolveDeploymentId(deployment_id);
  if (hydratedDeployments.has(fid)) return;
  hydratedDeployments.add(fid);
  const map = new Map<string, CommandRecord>();
  for (const row of getMemoryJournal().loadCommands(fid) as CommandRecord[]) {
    map.set(row.command_id, row);
  }
  commandsByDeployment.set(fid, map);
}

function persist(deployment_id = currentDeploymentId(), command_id?: string): void {
  const fid = resolveDeploymentId(deployment_id);
  if (command_id) {
    const record = commandsForDeployment(fid).get(command_id);
    if (record) {
      getMemoryJournal().appendCommand(fid, record);
    } else {
      log.warn("persist skipped: command not in memory", {
        deployment_id: fid,
        command_id,
      });
    }
    return;
  }
  getMemoryJournal().saveCommands(fid, [...commandsForDeployment(fid).values()]);
}

function createFileCommandStorePort(): CommandStorePort {
  return {
    getRecord(command_id, deployment_id) {
      return commandsForDeployment(deployment_id).get(command_id);
    },
    listRecords(deployment_id) {
      return [...commandsForDeployment(deployment_id).values()];
    },
    upsertRecord(record) {
      const deployment_id = resolveDeploymentId(record.command.deployment_id);
      commandsForDeployment(deployment_id).set(record.command_id, record);
      persist(deployment_id, record.command_id);
    },
    clearDeployment(deployment_id) {
      commandsForDeployment(deployment_id).clear();
      hydratedDeployments.delete(deployment_id);
      persist(deployment_id);
    },
  };
}

const api = createCommandStoreApi(createFileCommandStorePort());

export const createCommand = api.createCommand;
export const attachCommandTelemetryAfter = api.attachCommandTelemetryAfter;
export const attachCommandTelemetryWindow = api.attachCommandTelemetryWindow;
export const markCommandExecutionSource = api.markCommandExecutionSource;
export const markCommandSent = api.markCommandSent;
export const markCommandFailed = api.markCommandFailed;
export const markCommandTimeout = api.markCommandTimeout;
export const recordConfigSyncAttempt = api.recordConfigSyncAttempt;
export const patchCommandConfigVersion = api.patchCommandConfigVersion;
export const recordCommandRetry = api.recordCommandRetry;
export const markCommandNotified = api.markCommandNotified;
export const applyCommandEvent = api.applyCommandEvent;
export const getCommand = api.getCommand;
export const listCommands = api.listCommands;
export const getRecentCommandForUser = api.getRecentCommandForUser;
export const findCommandsForUser = api.findCommandsForUser;
export const listAwaitingAckCommands = api.listAwaitingAckCommands;
export const listUnsentCommands = api.listUnsentCommands;
export const getRunningActionForDevice = api.getRunningActionForDevice;
export const getInFlightCommandForDevice = api.getInFlightCommandForDevice;
export const clearCommands = api.clearCommands;
