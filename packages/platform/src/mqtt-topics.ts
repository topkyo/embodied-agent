export const DEPLOYMENT_TOPIC_PREFIX = "deployments";

export function parseDeploymentIdFromMqttTopic(topic: string): string | null {
  const parts = topic.split("/");
  if (parts.length < 2 || parts[0] !== DEPLOYMENT_TOPIC_PREFIX) return null;
  const deployment_id = parts[1]?.trim();
  return deployment_id || null;
}

export type NodeScopedMqttTopicKind = "events" | "telemetry" | "heartbeat";

export type NodeScopedMqttTopic = {
  deployment_id: string;
  node_id: string;
  kind: NodeScopedMqttTopicKind;
};

export function parseNodeScopedMqttTopic(topic: string): NodeScopedMqttTopic | null {
  const parts = topic.split("/");
  if (parts.length !== 5 || parts[0] !== DEPLOYMENT_TOPIC_PREFIX || parts[2] !== "nodes") {
    return null;
  }
  const deployment_id = parts[1]?.trim();
  const node_id = parts[3]?.trim();
  const kind = parts[4]?.trim();
  if (!deployment_id || !node_id) return null;
  if (kind !== "events" && kind !== "telemetry" && kind !== "heartbeat") {
    return null;
  }
  return { deployment_id, node_id, kind };
}

export function pairingInstallCodeTopic(deployment_id: string, node_id: string): string {
  return `${DEPLOYMENT_TOPIC_PREFIX}/${deployment_id}/pairing/${node_id}/install_code`;
}

export function nodeConfigTopic(deployment_id: string, node_id: string): string {
  return `${DEPLOYMENT_TOPIC_PREFIX}/${deployment_id}/nodes/${node_id}/config`;
}

export function nodeCommandTopic(deployment_id: string, node_id: string): string {
  return `${DEPLOYMENT_TOPIC_PREFIX}/${deployment_id}/nodes/${node_id}/commands`;
}

export function nodeEventsTopic(deployment_id: string, node_id: string): string {
  return `${DEPLOYMENT_TOPIC_PREFIX}/${deployment_id}/nodes/${node_id}/events`;
}

export function nodeTelemetryTopic(deployment_id: string, node_id: string): string {
  return `${DEPLOYMENT_TOPIC_PREFIX}/${deployment_id}/nodes/${node_id}/telemetry`;
}

export function nodeHeartbeatTopic(deployment_id: string, node_id: string): string {
  return `${DEPLOYMENT_TOPIC_PREFIX}/${deployment_id}/nodes/${node_id}/heartbeat`;
}

function requireDeploymentId(deployment_id: string): string {
  const trimmed = deployment_id.trim();
  if (!trimmed) throw new Error("deployment_id is required for MQTT subscription");
  return trimmed;
}

export function nodeEventsSubscription(deployment_id: string): string {
  return `${DEPLOYMENT_TOPIC_PREFIX}/${requireDeploymentId(deployment_id)}/nodes/+/events`;
}

export function nodeTelemetrySubscription(deployment_id: string): string {
  return `${DEPLOYMENT_TOPIC_PREFIX}/${requireDeploymentId(deployment_id)}/nodes/+/telemetry`;
}

export function nodeHeartbeatSubscription(deployment_id: string): string {
  return `${DEPLOYMENT_TOPIC_PREFIX}/${requireDeploymentId(deployment_id)}/nodes/+/heartbeat`;
}
