import { commandEventSchema, nodeEventSchema } from "@embodied-agent/core";
import { parseNodeScopedMqttTopic, safeEqualString } from "@embodied-agent/platform";
import { applyCommandEvent } from "../commands/store.js";
import { applySetModeFromCompletedCommand } from "../commands/mode-sync.js";
import { notifyCommandStatusChange } from "../commands/notify.js";
import {
  recordNodeAppliedConfigVersion,
  republishNodeConfigOnMismatch,
} from "@embodied-agent/node";
import { getNodeToken } from "@embodied-agent/node";
import { getEffectiveSettings } from "../settings/store.js";
import { resolveConfiguredMqttUrl } from "./url.js";
import { createLogger } from "@embodied-agent/platform";
import type { MqttContext } from "@embodied-agent/node";

const log = createLogger("mqtt-event");

export type EventMessageResult =
  | { kind: "ignored" }
  | { kind: "auth_drop"; node_id: string }
  | { kind: "node_event"; event_type: string; node_id: string }
  | { kind: "command_event"; command_id: string; status: string };

export function handleEventMessage(
  mqttCtx: MqttContext,
  topic: string,
  payload: unknown,
): EventMessageResult {
  const topicInfo = parseNodeScopedMqttTopic(topic);
  if (!topicInfo || topicInfo.kind !== "events") {
    return { kind: "ignored" };
  }
  const activeDeploymentId = getEffectiveSettings().deployment_id;
  if (topicInfo.deployment_id !== activeDeploymentId) {
    log.warn("ignore non-active deployment event topic", {
      topic_deployment_id: topicInfo.deployment_id,
      active_deployment_id: activeDeploymentId,
    });
    return { kind: "ignored" };
  }

  const raw = payload as Record<string, unknown>;
  const nodeId = raw?.node_id;
  const deploymentId = raw?.deployment_id;
  if (typeof nodeId === "string" && nodeId !== topicInfo.node_id) {
    log.warn("event node_id/topic mismatch", {
      topic_node_id: topicInfo.node_id,
      node_id: nodeId,
    });
    return { kind: "ignored" };
  }
  if (typeof deploymentId === "string" && deploymentId !== topicInfo.deployment_id) {
    log.warn("event deployment_id/topic mismatch", {
      topic_deployment_id: topicInfo.deployment_id,
      deployment_id: deploymentId,
    });
    return { kind: "ignored" };
  }

  const authNodeId = typeof nodeId === "string" && nodeId ? nodeId : topicInfo.node_id;
  if (authNodeId) {
    const registeredToken = getNodeToken(topicInfo.deployment_id, authNodeId);
    const provided = raw?.node_token;
    if (
      !registeredToken ||
      typeof provided !== "string" ||
      !safeEqualString(provided, registeredToken)
    ) {
      log.warn("invalid or missing node_token", { node_id: authNodeId, kind: "event" });
      return { kind: "auth_drop", node_id: authNodeId };
    }
  }

  const nodeEvt = nodeEventSchema.safeParse(raw);
  if (nodeEvt.success) {
    const evt = nodeEvt.data;
    log.info("node event", {
      event_type: evt.event_type,
      node_id: evt.node_id,
      config_version: evt.config_version,
    });
    if (evt.event_type === "config_applied") {
      recordNodeAppliedConfigVersion(
        evt.deployment_id,
        evt.node_id,
        evt.config_version,
        "config_applied",
      );
    }
    return {
      kind: "node_event",
      event_type: evt.event_type,
      node_id: evt.node_id,
    };
  }

  const parsed = commandEventSchema.safeParse(raw);
  if (!parsed.success) {
    return { kind: "ignored" };
  }

  const record = applyCommandEvent(parsed.data);
  if (record) {
    applySetModeFromCompletedCommand(record);
    void notifyCommandStatusChange(record);
    if (record.status === "rejected") {
      const mqttUrl = resolveConfiguredMqttUrl();
      const mqtt = mqttUrl ? mqttCtx.publisher.get(mqttUrl) : undefined;
      void republishNodeConfigOnMismatch(parsed.data, mqtt);
    }
    return {
      kind: "command_event",
      command_id: record.command_id,
      status: record.status,
    };
  }

  return { kind: "ignored" };
}
