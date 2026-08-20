#!/usr/bin/env tsx
/**
 * 为标准模拟节点签发 node_token（缺失时写入 deployments/{deployment_id}/node-tokens.json）。
 *
 * 用法：AGENT_DATA_DIR=.agentstack/dev-profiles/greenhouse/data npx tsx scripts/ensure-sim-node-tokens.ts
 */
import { getNodeToken, issueNodeToken } from "@embodied-agent/node";

import { SIM_NODE_IDS, SIM_NODE_PRESETS } from "@embodied-agent/domain-agriculture";

const SIM_NODES = SIM_NODE_IDS;

function main() {
  for (const nodeId of SIM_NODES) {
    const preset = SIM_NODE_PRESETS[nodeId];
    if (!preset) throw new Error(`unknown sim node: ${nodeId}`);
    const existing = getNodeToken(preset.deployment_id, nodeId);
    if (existing) {
      console.log(`OK ${nodeId} token=${existing.slice(0, 20)}…`);
      continue;
    }
    const token = issueNodeToken(preset.deployment_id, nodeId);
    console.log(`ISSUED ${nodeId} token=${token.slice(0, 20)}…`);
  }
}

main();
