import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pruneJsonlByRetention } from "./jsonl-retention.js";

describe("pruneJsonlByRetention", () => {
  const env = { ...process.env };
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jsonl-retention-"));
    path = join(dir, "rows.jsonl");
  });

  afterEach(() => {
    process.env = { ...env };
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns 0 when RETENTION_DAYS is unset", () => {
    delete process.env.RETENTION_DAYS;
    writeFileSync(path, '{"ts":"2000-01-01T00:00:00.000Z"}\n', "utf8");
    expect(pruneJsonlByRetention(path)).toBe(0);
    expect(readFileSync(path, "utf8")).toContain("2000-01-01");
  });

  it("warns and skips when RETENTION_DAYS is invalid", () => {
    process.env.RETENTION_DAYS = "not-a-number";
    writeFileSync(path, '{"ts":"2000-01-01T00:00:00.000Z"}\n', "utf8");
    expect(pruneJsonlByRetention(path)).toBe(0);
  });

  it("removes rows older than cutoff", () => {
    process.env.RETENTION_DAYS = "30";
    const now = Date.parse("2026-06-23T12:00:00.000Z");
    writeFileSync(
      path,
      ['{"ts":"2020-01-01T00:00:00.000Z"}', '{"recorded_at":"2026-06-20T00:00:00.000Z"}'].join(
        "\n",
      ) + "\n",
      "utf8",
    );
    const removed = pruneJsonlByRetention(path, now);
    expect(removed).toBe(1);
    const kept = readFileSync(path, "utf8").trim().split("\n");
    expect(kept).toHaveLength(1);
    expect(kept[0]).toContain("2026-06-20");
  });

  it("drops lines without parseable timestamps", () => {
    process.env.RETENTION_DAYS = "7";
    const now = Date.now();
    writeFileSync(
      path,
      ['{"note":"no-ts"}', '{"ts":"invalid"}', '{"ts":"2099-01-01T00:00:00.000Z"}'].join("\n") +
        "\n",
      "utf8",
    );
    const removed = pruneJsonlByRetention(path, now);
    expect(removed).toBe(2);
    expect(readFileSync(path, "utf8")).toContain("2099-01-01");
  });

  it("drops malformed json lines", () => {
    process.env.RETENTION_DAYS = "7";
    writeFileSync(path, 'not-json\n{"ts":"2099-01-01T00:00:00.000Z"}\n', "utf8");
    expect(pruneJsonlByRetention(path)).toBe(1);
    expect(existsSync(path)).toBe(true);
  });
});
