#!/usr/bin/env tsx
/**
 * 双棚模拟器启动前：补齐 registry 节点、token，必要时 rebind 并 MQTT 下发 config。
 *
 * 用法：
 *   AGENT_DATA_DIR=.agentstack/dev-profiles/greenhouse/data npx tsx scripts/ensure-sim-dual-nodes.ts
 *   npm run ensure:sim-dual
 */
import { ensureSimDualNodes } from "./lib/sim-dual-nodes.js";

async function main() {
  const result = await ensureSimDualNodes();
  console.log(
    `[ensure-sim] done rebound=[${result.rebound.join(",")}] skipped=[${result.skipped.join(",")}]`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
