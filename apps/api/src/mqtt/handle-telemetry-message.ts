import { ingestHeartbeatMessage, ingestTelemetryMessage } from "../telemetry/store.js";
import { parseNodeScopedMqttTopic, safeEqualString } from "@embodied-agent/platform";
import { recordNodeAppliedConfigVersion } from "@embodied-agent/node";
import { evaluateAndPushAlerts } from "../alerts/push.js";
import { getNodeToken } from "@embodied-agent/node";
import { createLogger } from "@embodied-agent/platform";
import { getEffectiveSettings } from "../settings/store.js";

const log = createLogger("mqtt-telemetry");

export type TelemetryMessageResult =
  | { kind: "ignored" }
  | { kind: "auth_drop"; node_id: string }
  | { kind: "heartbeat"; node_id?: string }
  | { kind: "telemetry" };

export function handleTelemetryMessage(topic: string, payload: unknown): TelemetryMessageResult {
  const topicInfo = parseNodeScopedMqttTopic(topic);
  if (!topicInfo || (topicInfo.kind !== "telemetry" && topicInfo.kind !== "heartbeat")) {
    return { kind: "ignored" };
  }
  const activeDeploymentId = getEffectiveSettings().deployment_id;
  if (topicInfo.deployment_id !== activeDeploymentId) {
    log.warn("ignore non-active deployment telemetry topic", {
      topic_deployment_id: topicInfo.deployment_id,
      active_deployment_id: activeDeploymentId,
    });
    return { kind: "ignored" };
  }

  const body = payload as Record<string, unknown>;
  const nodeId = body?.node_id;
  const deploymentId = body?.deployment_id;
  if (typeof nodeId === "string" && nodeId !== topicInfo.node_id) {
    log.warn("telemetry node_id/topic mismatch", {
      topic_node_id: topicInfo.node_id,
      node_id: nodeId,
    });
    return { kind: "ignored" };
  }
  if (typeof deploymentId === "string" && deploymentId !== topicInfo.deployment_id) {
    log.warn("telemetry deployment_id/topic mismatch", {
      topic_deployment_id: topicInfo.deployment_id,
      deployment_id: deploymentId,
    });
    return { kind: "ignored" };
  }

  const authNodeId = typeof nodeId === "string" && nodeId ? nodeId : topicInfo.node_id;
  if (authNodeId) {
    const registeredToken = getNodeToken(topicInfo.deployment_id, authNodeId);
    const provided = body?.node_token;
    if (
      !registeredToken ||
      typeof provided !== "string" ||
      !safeEqualString(provided, registeredToken)
    ) {
      log.warn("invalid or missing node_token", { node_id: authNodeId, topic });
      return { kind: "auth_drop", node_id: authNodeId };
    }
  }

  if (topicInfo.kind === "heartbeat") {
    ingestHeartbeatMessage(body, topicInfo.deployment_id);
    const hbNodeId = body?.node_id;
    const cv = body?.config_version;
    if (typeof hbNodeId === "string" && typeof cv === "number" && Number.isFinite(cv)) {
      recordNodeAppliedConfigVersion(topicInfo.deployment_id, hbNodeId, cv, "heartbeat");
    }
    return {
      kind: "heartbeat",
      node_id: typeof hbNodeId === "string" ? hbNodeId : undefined,
    };
  }

  if (topicInfo.kind === "telemetry" && ingestTelemetryMessage(body, topicInfo.deployment_id)) {
    void evaluateAndPushAlerts().catch((e) => {
      log.warn("alert push error", {
        error: e instanceof Error ? e.message : String(e),
      });
    });
    return { kind: "telemetry" };
  }

  return { kind: "ignored" };
}
