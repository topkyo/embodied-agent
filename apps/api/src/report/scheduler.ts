import { hasActiveScheduledReports } from "@embodied-agent/runtime";
import { listDueSchedules, markScheduleSent } from "./schedule-store.js";
import { pushStatusReportToUser } from "./status-push.js";
import { loadPrimaryWechatAccount } from "../wechat/ilink-store.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";

export async function tickStatusReportSchedules(): Promise<number> {
  if (!hasActiveScheduledReports(getPlatformRuntimeContext())) return 0;
  if (!loadPrimaryWechatAccount()?.token) return 0;
  const due = listDueSchedules();
  let sent = 0;
  for (const schedule of due) {
    const ok = await pushStatusReportToUser(schedule);
    if (ok) {
      markScheduleSent(schedule.id, new Date(), schedule.deployment_id);
      sent++;
    }
  }
  return sent;
}
