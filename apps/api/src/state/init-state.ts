import { createLogger } from "@embodied-agent/platform";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveAgentDataDir } from "@embodied-agent/platform";
import { hydrateConversationFromRedis } from "../chat/conversation-store.js";
import { hydratePendingClarificationFromRedis } from "../policy/pending-clarification.js";
import { hydratePendingConfirmFromRedis } from "../policy/pending-confirm.js";
import { stateBackend, useSqliteCommandStore } from "./config.js";
import { getRedisClient } from "./redis-client.js";
import { markRedisSessionsReady } from "./session-hydrate.js";

const log = createLogger("state");
let initialized = false;

function sqliteImportMarkerPath(): string {
  return resolve(resolveAgentDataDir(), ".sqlite-command-import.done");
}

async function importCommandsFromJsonlOnce(): Promise<void> {
  const marker = sqliteImportMarkerPath();
  if (existsSync(marker)) return;
  const deploymentsDir = resolve(resolveAgentDataDir(), "deployments");
  if (!existsSync(deploymentsDir)) return;
  const { importCommandsFromJsonl } = await import("../commands/store-sqlite.js");
  let total = 0;
  for (const deployment_id of readdirSync(deploymentsDir)) {
    const n = importCommandsFromJsonl(deployment_id);
    if (n > 0) {
      log.info("sqlite import", { deployment_id, rows: n });
      total += n;
    }
  }
  const dir = resolveAgentDataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(marker, `${new Date().toISOString()} rows=${total}\n`, "utf8");
}

/** Boot-time state backend validation and one-shot SQLite import from JSONL. */
export async function initStateBackend(): Promise<void> {
  if (initialized) return;
  initialized = true;
  const backend = stateBackend();
  log.info("backend initialized", { backend });
  if (backend === "redis") {
    await getRedisClient();
    await Promise.all([
      hydratePendingConfirmFromRedis(),
      hydratePendingClarificationFromRedis(),
      hydrateConversationFromRedis(),
    ]);
    markRedisSessionsReady();
    if (useSqliteCommandStore()) {
      await importCommandsFromJsonlOnce();
    }
  }
}
