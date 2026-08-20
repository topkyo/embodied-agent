import { useSqliteCommandStore } from "../state/config.js";

const impl = useSqliteCommandStore()
  ? await import("./store-sqlite.js")
  : await import("./store-file.js");

export const canApplyCommandEvent = impl.canApplyCommandEvent;
export const createCommand = impl.createCommand;
export const attachCommandTelemetryAfter = impl.attachCommandTelemetryAfter;
export const attachCommandTelemetryWindow = impl.attachCommandTelemetryWindow;
export const markCommandExecutionSource = impl.markCommandExecutionSource;
export const markCommandSent = impl.markCommandSent;
export const markCommandFailed = impl.markCommandFailed;
export const markCommandTimeout = impl.markCommandTimeout;
export const recordConfigSyncAttempt = impl.recordConfigSyncAttempt;
export const patchCommandConfigVersion = impl.patchCommandConfigVersion;
export const recordCommandRetry = impl.recordCommandRetry;
export const markCommandNotified = impl.markCommandNotified;
export const applyCommandEvent = impl.applyCommandEvent;
export const getCommand = impl.getCommand;
export const listCommands = impl.listCommands;
export const getRecentCommandForUser = impl.getRecentCommandForUser;
export const findCommandsForUser = impl.findCommandsForUser;
export const listAwaitingAckCommands = impl.listAwaitingAckCommands;
export const listUnsentCommands = impl.listUnsentCommands;
export const getRunningActionForDevice = impl.getRunningActionForDevice;
export const getInFlightCommandForDevice = impl.getInFlightCommandForDevice;
export const clearCommands = impl.clearCommands;

export type { CommandLookupOpts } from "./command-store-port.js";
