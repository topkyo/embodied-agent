import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  createLogger,
  deploymentScopedPath,
  isValidDeploymentIdSegment,
  pruneJsonlByRetention,
  resolveAgentDataDir,
} from "@embodied-agent/platform";

const log = createLogger("jobs.retention");

const JSONL_ARTIFACTS = [
  "command-logs.jsonl",
  "operation-logs.jsonl",
  "intent-failures.jsonl",
  "scene-outcomes.jsonl",
  "flywheel-scene-attestations.jsonl",
  "intent-resolve.jsonl",
] as const;

function listDeploymentIds(dataRoot: string): string[] {
  const deploymentsDir = join(dataRoot, "deployments");
  if (!existsSync(deploymentsDir)) return [];
  return readdirSync(deploymentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isValidDeploymentIdSegment(entry.name))
    .map((entry) => entry.name);
}

function pruneDeploymentJsonl(dataRoot: string, deploymentId: string, now: number): number {
  let removed = 0;
  for (const name of JSONL_ARTIFACTS) {
    const path = deploymentScopedPath(dataRoot, deploymentId, name);
    if (!existsSync(path)) continue;
    removed += pruneJsonlByRetention(path, now);
  }
  return removed;
}

export function runDataRetentionPass(now = Date.now()): number {
  if (!process.env.RETENTION_DAYS?.trim()) return 0;
  const dataRoot = resolveAgentDataDir();
  let removed = 0;
  const deploymentIds = listDeploymentIds(dataRoot);
  for (const deploymentId of deploymentIds) {
    removed += pruneDeploymentJsonl(dataRoot, deploymentId, now);
  }
  const rootIntent = join(dataRoot, "intent-resolve.jsonl");
  if (existsSync(rootIntent)) {
    removed += pruneJsonlByRetention(rootIntent, now);
  }
  if (removed > 0) {
    log.info("retention pruned rows", { deployment_ids: deploymentIds, removed });
  }
  return removed;
}
