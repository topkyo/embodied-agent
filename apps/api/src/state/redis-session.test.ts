import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";

const store = new Map<string, string>();

vi.mock("./redis-client.js", () => ({
  getRedisClient: vi.fn(async () => ({
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    scanIterator: vi.fn(async function* () {
      const keys = [...store.keys()];
      if (keys.length > 0) yield keys;
    }),
  })),
}));

type RedisSessionModule = typeof import("./redis-session.js");

let redisSession: RedisSessionModule;
let testDir: string;

describe("redis-session", () => {
  beforeEach(async () => {
    store.clear();
    testDir = allocateAgentDataDir("redis-session");
    vi.resetModules();
    redisSession = await import("./redis-session.js");
  });

  afterEach(() => {
    store.clear();
    releaseAgentDataDir(testDir);
  });

  it("set/get round-trip json", async () => {
    await redisSession.redisSetJson("session", "conv-1", { text: "hello" }, 60);
    const value = await redisSession.redisGetJson<{ text: string }>("session", "conv-1");
    expect(value).toEqual({ text: "hello" });
  });

  it("del removes key", async () => {
    await redisSession.redisSetJson("session", "conv-2", { text: "bye" }, 60);
    await redisSession.redisDel("session", "conv-2");
    expect(await redisSession.redisGetJson("session", "conv-2")).toBeUndefined();
  });

  it("lists keys by namespace pattern", async () => {
    await redisSession.redisSetJson("session", "a", { n: 1 }, 60);
    await redisSession.redisSetJson("session", "b", { n: 2 }, 60);
    const keys = await redisSession.redisListKeys("session", "*");
    expect(keys.length).toBeGreaterThanOrEqual(2);
  });
});
