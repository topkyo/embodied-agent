import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeSync, existsSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { FileLockBusyError, withFileLock } from "./file-lock.js";

let testDir: string;
let lockPath: string;

describe("withFileLock", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("file-lock");
    lockPath = join(testDir, "test.lock");
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
    delete process.env.FILE_LOCK_STALE_MS;
  });

  it("runs fn and releases lock", async () => {
    const out = await withFileLock(lockPath, () => 42);
    expect(out).toBe(42);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("reclaims stale lock when holder pid is dead", async () => {
    process.env.FILE_LOCK_STALE_MS = "1";
    const fd = openSync(lockPath, "wx");
    writeSync(
      fd,
      `${JSON.stringify({ pid: 1, started_at: new Date(0).toISOString() })}\n`,
      undefined,
      "utf8",
    );
    closeSync(fd);

    const out = await withFileLock(lockPath, () => "ok");
    expect(out).toBe("ok");
    expect(existsSync(lockPath)).toBe(false);
  });

  it("throws FileLockBusyError for active lock", async () => {
    writeFileSync(
      lockPath,
      `${JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() })}\n`,
      "utf8",
    );
    await expect(
      withFileLock(lockPath, () => {
        /* noop */
      }),
    ).rejects.toThrow(FileLockBusyError);
    const meta = JSON.parse(readFileSync(lockPath, "utf8"));
    expect(meta.pid).toBe(process.pid);
  });
});
