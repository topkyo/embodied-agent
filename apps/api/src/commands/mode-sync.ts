import type { CommandRecord } from "./types.js";
import { setSceneMode } from "@embodied-agent/runtime";
import { getPlatformRuntimeContext } from "../runtime/context.js";

/** 仅在设备确认 completed 后写入云端环控模式，避免「已下发」与真实状态不一致。 */
export function applySetModeFromCompletedCommand(record: CommandRecord): void {
  const cmd = record.command;
  if (cmd.action !== "set_mode" || record.status !== "completed") return;
  const mode = cmd.parameters?.mode;
  if (mode !== "night_vent" && mode !== "off") return;
  if (!cmd.entity_id) {
    throw new Error(`set_mode command ${cmd.command_id} missing entity_id`);
  }
  const p = cmd.parameters ?? {};
  setSceneMode(getPlatformRuntimeContext(), cmd.entity_id, cmd.issued_by.user_id, {
    mode,
    max_temp_c: typeof p.max_temp_c === "number" ? p.max_temp_c : undefined,
    temp_high_c: typeof p.temp_high_c === "number" ? p.temp_high_c : undefined,
    temp_low_c: typeof p.temp_low_c === "number" ? p.temp_low_c : undefined,
    until_iso: typeof p.until_iso === "string" ? p.until_iso : undefined,
  });
}
