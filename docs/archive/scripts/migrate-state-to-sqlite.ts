// Archived script: do not execute as a current repository entrypoint.
/**
 * ARCHIVED — 只读追溯，非当前运维入口。
 * v0.4.0 后 API 冷启动会自动将 JSONL 导入 SQLite（见 `.sqlite-command-import.done`）。
 * 原路径：`scripts/migrate-state-to-sqlite.ts`（2026-07-08 P1-2 归档）。
 *
 * Import deployments/{deployment}/command-logs.jsonl into SQLite (idempotent).
 * Usage: AGENT_DATA_DIR=.agentstack/dev-profiles/greenhouse/data npx tsx docs/archive/scripts/migrate-state-to-sqlite.ts
 */
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { resolveAgentDataDir } from "@embodied-agent/platform";

process.env.STATE_BACKEND = "redis";

const { importCommandsFromJsonl, closeSqliteForTests } =
  await import("../../../apps/api/src/commands/store-sqlite.js");

const root = resolveAgentDataDir();
const deploymentsDir = resolve(root, "deployments");
if (!existsSync(deploymentsDir)) {
  console.log("[migrate] no deployments/ directory, nothing to import");
  process.exit(0);
}

let total = 0;
for (const deployment_id of readdirSync(deploymentsDir)) {
  const n = importCommandsFromJsonl(deployment_id);
  if (n > 0) {
    console.log(`[migrate] deployment ${deployment_id}: ${n} commands`);
    total += n;
  }
}
closeSqliteForTests();
console.log(`[migrate] done, ${total} commands imported`);
