import { getMemoryJournal } from "../memory/journal.js";
import type { CommandRecord } from "./types.js";
import { createCommandStoreApi, type CommandStorePort } from "./command-store-port.js";

export { canApplyCommandEvent } from "./store-transitions.js";
export type { CommandLookupOpts } from "./command-store-port.js";

function journal() {
  const j = getMemoryJournal();
  if (!j.upsertCommand || !j.getCommand) {
    throw new Error("MemoryJournal sqlite 后端未初始化");
  }
  return j;
}

function createSqliteCommandStorePort(): CommandStorePort {
  return {
    getRecord(command_id, deployment_id) {
      return journal().getCommand!(command_id, deployment_id) as CommandRecord | undefined;
    },
    listRecords(deployment_id) {
      return getMemoryJournal().loadCommands(deployment_id) as CommandRecord[];
    },
    upsertRecord(record) {
      journal().upsertCommand!(record);
    },
    clearDeployment(deployment_id) {
      journal().deleteCommands!(deployment_id);
    },
  };
}

const api = createCommandStoreApi(createSqliteCommandStorePort());

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

export function closeSqliteForTests(): void {
  getMemoryJournal().closeSqlite?.();
}

/** Import JSONL command logs into SQLite (idempotent upsert). */
export function importCommandsFromJsonl(deployment_id: string): number {
  const j = getMemoryJournal();
  if (!j.importCommandsFromJsonl) {
    throw new Error("MemoryJournal sqlite 后端未初始化");
  }
  return j.importCommandsFromJsonl(deployment_id);
}
