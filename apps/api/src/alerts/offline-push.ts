import { loadRegistry } from "@embodied-agent/node";
import { getEffectiveSettings } from "../settings/store.js";
import { isNodeOffline } from "./node-offline.js";
import {
  clearAlertCooldown,
  confirmAlertFiredResilient,
  releaseAlertReservation,
  reserveAlertCooldown,
  wasAlertEverFired,
} from "./alert-state.js";
import { appendAlertEvent } from "./alert-events.js";
import { listWechatRecipientsByRoles } from "../notifications/recipients.js";
import { defaultProactiveSend } from "../channels/proactive-send.js";
import { loadPrimaryWechatAccount } from "../wechat/ilink-store.js";
import type { AlertPushSend } from "./push.js";

const OFFLINE_COOLDOWN_SEC = Number(process.env.OFFLINE_ALERT_COOLDOWN_SECONDS ?? "1800");

function nodeIds(deployment_id: string): string[] {
  const registry = loadRegistry();
  const ids = new Set<string>();
  for (const n of registry.nodes ?? []) {
    if (n.deployment_id === deployment_id && n.status === "active") ids.add(n.node_id);
  }
  for (const d of registry.devices) {
    if (d.deployment_id === deployment_id && d.node_id) ids.add(d.node_id);
  }
  return [...ids];
}

export async function evaluateNodeOfflineAlerts(
  send: AlertPushSend = defaultProactiveSend,
): Promise<number> {
  const settings = getEffectiveSettings();
  if (settings.alert_push_enabled === false) return 0;
  if (!loadPrimaryWechatAccount()?.token) return 0;

  let fired = 0;
  const deployment_id = settings.deployment_id;

  for (const node_id of nodeIds(deployment_id)) {
    const offlineKey = `offline:${node_id}`;
    const recoveryKey = `recovery:${node_id}`;
    const offline = isNodeOffline(node_id, Date.now(), deployment_id);

    const recipients = listWechatRecipientsByRoles(["owner", "operator"]);

    if (offline) {
      if (
        !(await reserveAlertCooldown(offlineKey, OFFLINE_COOLDOWN_SEC, Date.now(), deployment_id))
      )
        continue;
      const message = `【离线报警】节点 ${node_id} 已离线，请检查设备与网络。`;
      let sent = false;
      for (const r of recipients) {
        if (await send(r.platform_user_id, message)) sent = true;
      }
      if (sent) {
        await confirmAlertFiredResilient(offlineKey, new Date(), deployment_id);
        appendAlertEvent({
          deployment_id,
          node_id,
          event_type: "offline",
          message,
        });
        fired++;
      } else {
        await releaseAlertReservation(offlineKey, deployment_id);
      }
      continue;
    }

    if (!(await wasAlertEverFired(offlineKey, deployment_id))) continue;
    if (!(await reserveAlertCooldown(recoveryKey, OFFLINE_COOLDOWN_SEC, Date.now(), deployment_id)))
      continue;
    const message = `【恢复在线】节点 ${node_id} 已恢复心跳。`;
    let sent = false;
    for (const r of recipients) {
      if (await send(r.platform_user_id, message)) sent = true;
    }
    if (sent) {
      await confirmAlertFiredResilient(recoveryKey, new Date(), deployment_id);
      await clearAlertCooldown(offlineKey, deployment_id);
      appendAlertEvent({
        deployment_id,
        node_id,
        event_type: "recovery",
        message,
      });
      fired++;
    } else {
      await releaseAlertReservation(recoveryKey, deployment_id);
    }
  }

  return fired;
}
