import {
  deploymentDataDir as platformDeploymentDataDir,
  deploymentScopedPath as platformDeploymentScopedPath,
  ensureDeploymentDir as platformEnsureDeploymentDir,
  isValidDeploymentIdSegment,
  parseDeploymentIdFromMqttTopic,
  resolveAgentDataDir,
} from "@embodied-agent/platform";

export { isValidDeploymentIdSegment };
import { getEffectiveSettings } from "../settings/store.js";

export { defaultDataRoot, resolveAgentDataDir } from "@embodied-agent/platform";

/** 本机持久化根目录（settings、registry）。显式设置 AGENT_DATA_DIR。 */
export function dataRoot(): string {
  return resolveAgentDataDir();
}

export function currentDeploymentId(): string {
  return getEffectiveSettings().deployment_id;
}

export function deploymentDir(deployment_id = currentDeploymentId()): string {
  return platformDeploymentDataDir(dataRoot(), deployment_id);
}

export function ensureDeploymentDir(deployment_id = currentDeploymentId()): string {
  return platformEnsureDeploymentDir(dataRoot(), deployment_id);
}

export function deploymentScopedPath(
  filename: string,
  deployment_id = currentDeploymentId(),
): string {
  return platformDeploymentScopedPath(dataRoot(), deployment_id, filename);
}

export type AdminDeploymentIdResult =
  { deployment_id: string } | { error: "invalid_deployment_id" | "deployment_mismatch" };

export function resolveAdminDeploymentId(
  requested: string | undefined,
  defaultDeploymentId: string,
): AdminDeploymentIdResult {
  const explicit = requested?.trim();
  const deployment_id = explicit || defaultDeploymentId.trim();
  if (!isValidDeploymentIdSegment(deployment_id)) {
    return { error: "invalid_deployment_id" };
  }
  if (deployment_id !== defaultDeploymentId.trim()) {
    return { error: "deployment_mismatch" };
  }
  return { deployment_id };
}

export { parseDeploymentIdFromMqttTopic };
