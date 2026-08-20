import { getTelemetry } from "../telemetry/store.js";
import { listBindings } from "../auth/platform-bind.js";
import { defaultProactiveSend } from "../channels/proactive-send.js";
import type { StatusReportSchedule } from "./schedule-store.js";
import { activeScheduledReports } from "@embodied-agent/runtime";
import { getPlatformRuntimeContext } from "../runtime/context.js";

export function buildStatusReportMessage(schedule: StatusReportSchedule): string {
  const scheduledReports = activeScheduledReports(getPlatformRuntimeContext());
  return scheduledReports.buildMessage(
    {
      deploymentId: schedule.deployment_id,
      userId: schedule.user_id,
      entityIds: schedule.entity_ids,
      intervalMinutes: schedule.interval_minutes,
    },
    {
      getTelemetry: (entityId) => {
        const telemetry = getTelemetry(entityId, schedule.deployment_id);
        return telemetry ? { ...telemetry, entity_id: entityId } : undefined;
      },
    },
  );
}

export async function pushStatusReportToUser(
  schedule: StatusReportSchedule,
  send = defaultProactiveSend,
): Promise<boolean> {
  const message = buildStatusReportMessage(schedule);
  const bindings = listBindings().filter(
    (binding) => binding.platform === "wechat" && binding.principal_user_id === schedule.user_id,
  );
  let sent = false;
  for (const binding of bindings) {
    if (await send(binding.platform_user_id, message)) sent = true;
  }
  return sent;
}
