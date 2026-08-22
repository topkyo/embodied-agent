#!/usr/bin/env tsx
/**
 * Issue node tokens for active nodes in a demo profile registry.
 * Usage: AGENT_DATA_DIR=<dataDir> npx tsx scripts/demo-issue-node-tokens.ts <deploymentId>
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { issueNodeToken } from "@embodied-agent/node";

const deploymentId = process.argv[2]?.trim();
if (!deploymentId) {
  console.error("用法: npx tsx scripts/demo-issue-node-tokens.ts <deploymentId>");
  process.exit(2);
}

const dataDir = process.env.AGENT_DATA_DIR?.trim();
if (!dataDir) {
  console.error("缺少 AGENT_DATA_DIR");
  process.exit(2);
}

const registryPath = join(dataDir, "device-registry.json");
if (!existsSync(registryPath)) {
  console.error(`[demo-issue-node-tokens] 跳过：无 registry ${registryPath}`);
  process.exit(0);
}

type RegistryNode = { node_id: string; deployment_id?: string; status?: string };

const registry = JSON.parse(readFileSync(registryPath, "utf8")) as {
  nodes?: RegistryNode[];
};

const activeNodes = (registry.nodes ?? []).filter(
  (node) => node.status === "active" && node.node_id?.trim(),
);

if (activeNodes.length === 0) {
  console.error("[demo-issue-node-tokens] 跳过：registry 无 active node");
  process.exit(0);
}

for (const node of activeNodes) {
  const nodeDeploymentId = node.deployment_id?.trim() || deploymentId;
  issueNodeToken(nodeDeploymentId, node.node_id);
  console.log(`[demo-issue-node-tokens] issued ${node.node_id} @ ${nodeDeploymentId}`);
}
