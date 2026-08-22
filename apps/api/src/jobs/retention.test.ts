import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDataRetentionPass } from "./retention.js";

describe("runDataRetentionPass", () => {
  const env = { ...process.env };
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "retention-job-"));
    process.env.AGENT_DATA_DIR = dataDir;
    process.env.RETENTION_DAYS = "1";
  });

  afterEach(() => {
    process.env = { ...env };
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("prunes JSONL for every deployment directory", () => {
    const oldTs = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    for (const dep of ["dep-a", "dep-b"]) {
      const dir = join(dataDir, "deployments", dep);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "command-logs.jsonl"),
        `${JSON.stringify({ ts: oldTs, command_id: dep })}\n`,
      );
    }

    const removed = runDataRetentionPass();
    expect(removed).toBe(2);
    expect(readFileSync(join(dataDir, "deployments", "dep-a", "command-logs.jsonl"), "utf8")).toBe(
      "",
    );
    expect(readFileSync(join(dataDir, "deployments", "dep-b", "command-logs.jsonl"), "utf8")).toBe(
      "",
    );
  });
});
