import type { CommandEvent } from "@embodied-agent/core";
import type { CommandRecord } from "./types.js";

export function commandEventMatchesRecord(event: CommandEvent, record: CommandRecord): boolean {
  const cmd = record.command;
  return (
    event.command_id === record.command_id &&
    event.deployment_id === cmd.deployment_id &&
    event.node_id === cmd.node_id &&
    event.device_id === cmd.device_id &&
    event.idempotency_key === cmd.idempotency_key
  );
}
