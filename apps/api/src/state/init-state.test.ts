import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

vi.mock("./redis-client.js", () => ({
  getRedisClient: vi.fn(async () => ({ isOpen: true })),
}));

vi.mock("../chat/conversation-store.js", () => ({
  hydrateConversationFromRedis: vi.fn(async () => {}),
}));
vi.mock("../policy/pending-clarification.js", () => ({
  hydratePendingClarificationFromRedis: vi.fn(async () => {}),
}));
vi.mock("../policy/pending-confirm.js", () => ({
  hydratePendingConfirmFromRedis: vi.fn(async () => {}),
}));

describe("initStateBackend sqlite import", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(resolve(tmpdir(), "init-state-"));
    process.env.AGENT_DATA_DIR = testDir;
    process.env.STATE_BACKEND = "redis";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.AGENT_DATA_DIR;
    delete process.env.STATE_BACKEND;
    delete process.env.REDIS_URL;
    rmSync(testDir, { recursive: true, force: true });
  });

  it("imports command-logs.jsonl only once", async () => {
    const farmDir = resolve(testDir, "deployments/dep-gh-pilot-001");
    mkdirSync(farmDir, { recursive: true });
    const record = {
      command_id: "cmd-test-1",
      command: {
        command_id: "cmd-test-1",
        deployment_id: "dep-gh-pilot-001",
        node_id: "node-1",
        device_id: "dev-1",
        action: "open",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      status: "completed",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    writeFileSync(resolve(farmDir, "command-logs.jsonl"), `${JSON.stringify(record)}\n`, "utf8");

    const { initStateBackend } = await import("./init-state.js");
    const { listCommands } = await import("../commands/store-sqlite.js");

    await initStateBackend();
    expect(listCommands("dep-gh-pilot-001")).toHaveLength(1);
    expect(existsSync(resolve(testDir, ".sqlite-command-import.done"))).toBe(true);

    writeFileSync(
      resolve(farmDir, "command-logs.jsonl"),
      `${JSON.stringify({ ...record, command_id: "cmd-test-2", command: { ...record.command, command_id: "cmd-test-2" } })}\n`,
      "utf8",
    );

    vi.resetModules();
    const { initStateBackend: initAgain } = await import("./init-state.js");
    const { listCommands: listAgain } = await import("../commands/store-sqlite.js");
    await initAgain();
    expect(listAgain("dep-gh-pilot-001")).toHaveLength(1);
  });
});
