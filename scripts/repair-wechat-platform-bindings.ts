#!/usr/bin/env npx tsx
/**
 * 一次性补齐历史 split-brain：wechat-ilink 账号已存在但 platform-bindings 缺失。
 * 升级修复版后可选执行；日常路径已由 repairMissingWechatBindings 懒修复覆盖。
 *
 * Usage:
 *   AGENT_DATA_DIR=.agentstack/dev-profiles/greenhouse/data npm run repair:wechat-bindings
 *   AGENT_DATA_DIR=... npm run repair:wechat-bindings -- --apply
 */
import { resolveAgentDataDir } from "@embodied-agent/platform";

const dataDir = resolveAgentDataDir();
const apply = process.argv.includes("--apply");

const { listMissingWechatBindings, readDeploymentId, repairMissingWechatBindings } =
  await import("../apps/api/src/wechat/resolve-wechat-principal.js");

console.log(`[repair-wechat] data_dir=${dataDir}`);

const deploymentId = readDeploymentId();
if (!deploymentId) {
  console.error(
    "[repair-wechat] deployment_id 未配置，无法 repair（检查 settings.json 或 DEPLOYMENT_ID）",
  );
  process.exit(1);
}
console.log(`[repair-wechat] deployment_id=${deploymentId}`);

const missing = listMissingWechatBindings();
if (missing.length === 0) {
  console.log("[repair-wechat] no missing bindings");
  process.exit(0);
}

for (const row of missing) {
  console.log(
    `[repair-wechat] ${apply ? "repairing" : "would repair"}: ${row.platform_user_id} -> ${row.principal_user_id} (account=${row.account_id})`,
  );
}

if (!apply) {
  console.log(
    `[repair-wechat] dry-run: ${missing.length} binding(s) would be repaired. Pass --apply to write.`,
  );
  process.exit(0);
}

const repaired = repairMissingWechatBindings();
const remaining = listMissingWechatBindings();
console.log(
  `[repair-wechat] applied: ${repaired} binding(s) repaired, ${remaining.length} remaining`,
);
process.exit(remaining.length > 0 ? 1 : 0);
