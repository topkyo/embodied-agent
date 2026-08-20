import { createLogger } from "@embodied-agent/platform";
import type { CommandRecord } from "../commands/types.js";

import type { CommandLifecycleStatus } from "../commands/types.js";

const log = createLogger("scene-hooks");
const TERMINAL: ReadonlySet<CommandLifecycleStatus> = new Set([
  "completed",
  "rejected",
  "failed",
  "timeout",
]);

export function isTerminalCommandStatus(status: CommandLifecycleStatus): boolean {
  return TERMINAL.has(status);
}

/** 终态命令触发场景钩子（动态 import 避免 store ↔ command-hooks 环依赖） */
export function dispatchTerminalCommandHooks(record: CommandRecord): void {
  if (!isTerminalCommandStatus(record.status)) return;
  void import("./command-hooks.js")
    .then((m) => m.onCommandTerminalEvent(record))
    .catch((err) => {
      log.error("terminal hook failed", { error: String(err) });
    });
}
