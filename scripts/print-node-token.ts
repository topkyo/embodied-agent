#!/usr/bin/env tsx
/**
 * 打印指定节点的明文 node_token（解密 AGENT_SECRETS_KEY 加密落盘的 token）。
 * 供裸机部署模拟器入口注入 NODE_TOKEN；真实固件在签发时已持有明文，不需要此脚本。
 *
 * 用法：npx tsx scripts/print-node-token.ts <deployment_id> <node_id>
 */
import { getNodeToken } from "@embodied-agent/node";

const [deploymentId, nodeId] = process.argv.slice(2);
if (!deploymentId || !nodeId) {
  console.error("用法：print-node-token.ts <deployment_id> <node_id>");
  process.exit(1);
}

const token = getNodeToken(deploymentId, nodeId);
if (!token) {
  console.error(`未找到 node_token：${deploymentId}/${nodeId}`);
  process.exit(2);
}
process.stdout.write(token);
