import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const redisStore = new Map<string, string>();

vi.mock("./redis-session.js", () => ({
  redisSetJson: vi.fn(async (namespace: string, key: string, value: unknown) => {
    redisStore.set(`${namespace}:${key}`, JSON.stringify(value));
  }),
  redisDel: vi.fn(async (namespace: string, key: string) => {
    redisStore.delete(`${namespace}:${key}`);
  }),
  redisListNamespaceEntries: vi.fn(async (namespace: string) => {
    const out = new Map<string, unknown>();
    for (const [k, raw] of redisStore) {
      if (!k.startsWith(`${namespace}:`)) continue;
      out.set(k.slice(namespace.length + 1), JSON.parse(raw));
    }
    return out;
  }),
}));

describe("session redis backing", () => {
  let testDir: string;

  beforeEach(() => {
    redisStore.clear();
    delete process.env.STATE_BACKEND;
    delete process.env.REDIS_URL;
    testDir = mkdtempSync(resolve(tmpdir(), "session-backing-"));
    process.env.AGENT_DATA_DIR = testDir;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.AGENT_DATA_DIR;
    delete process.env.STATE_BACKEND;
    delete process.env.REDIS_URL;
    vi.resetModules();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("persists pending-confirm to redis when STATE_BACKEND=redis", async () => {
    process.env.STATE_BACKEND = "redis";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    const { markRedisSessionsReady } = await import("./session-hydrate.js");
    const { clearAllPendingConfirm, getPendingConfirm, setPendingConfirm } =
      await import("../policy/pending-confirm.js");
    const { hydratePendingConfirmFromRedis } = await import("../policy/pending-confirm.js");

    markRedisSessionsReady();
    clearAllPendingConfirm();
    setPendingConfirm({
      intent: {
        skill: "greenhouse.open_vent",
        target: { greenhouse_id: "gh-001" },
        parameters: { duration_seconds: 600 },
      },
      user_id: "owner-001",
      conversation_id: "conv-redis",
      model: "mock",
    });

    expect(getPendingConfirm("owner-001", "conv-redis")).toBeDefined();
    expect(redisStore.has("pending-confirm:dep-gh-pilot-001:owner-001:conv-redis")).toBe(true);

    clearAllPendingConfirm();
    expect(getPendingConfirm("owner-001", "conv-redis")).toBeUndefined();

    redisStore.set(
      "pending-confirm:dep-gh-pilot-001:owner-001:conv-redis",
      JSON.stringify({
        deployment_id: "dep-gh-pilot-001",
        intent: {
          skill: "greenhouse.open_vent",
          target: { greenhouse_id: "gh-001" },
          parameters: { duration_seconds: 600 },
        },
        user_id: "owner-001",
        conversation_id: "conv-redis",
        model: "mock",
        created_at: Date.now(),
        expires_at: Date.now() + 60_000,
      }),
    );
    await hydratePendingConfirmFromRedis();
    expect(getPendingConfirm("owner-001", "conv-redis")?.intent.skill).toBe("greenhouse.open_vent");
  });
});
