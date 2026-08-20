import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { isValidDeploymentIdSegment } from "./deployment-id.js";

function requireDeploymentIdSegment(deployment_id: string): string {
  const value = deployment_id.trim();
  if (!isValidDeploymentIdSegment(value)) {
    throw new Error(`非法 deployment_id 路径片段：${deployment_id || "(empty)"}`);
  }
  return value;
}

function requireScopedFilename(filename: string): string {
  const value = filename.trim();
  if (!value || value.startsWith("/") || value.split(/[\\/]+/).includes("..")) {
    throw new Error(`非法 deployment scoped filename：${filename || "(empty)"}`);
  }
  return value;
}

export function deploymentDataDir(dataRoot: string, deployment_id: string): string {
  return resolve(dataRoot, "deployments", requireDeploymentIdSegment(deployment_id));
}

export function ensureDeploymentDir(dataRoot: string, deployment_id: string): string {
  const dir = deploymentDataDir(dataRoot, deployment_id);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function deploymentScopedPath(
  dataRoot: string,
  deployment_id: string,
  filename: string,
): string {
  return resolve(ensureDeploymentDir(dataRoot, deployment_id), requireScopedFilename(filename));
}
