import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { seedDefaultUsers } from "../test/users-fixture.js";

let testDir: string;

describe("platform-bind", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    seedDefaultUsers();
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("does not resolve fixture principal id as a platform user", async () => {
    const { resolvePlatformUser } = await import("./platform-bind.js");
    const u = resolvePlatformUser("wechat", "owner-001");
    expect(u).toBeNull();
  });

  it("resolves bound platform user", async () => {
    const mod = await import("./platform-bind.js");
    mod.upsertBinding("wechat", "wx_farmer_9", "owner-001");
    const u = mod.resolvePlatformUser("wechat", "wx_farmer_9");
    expect(u?.role).toBe("owner");
  });

  it("returns null for unknown platform user", async () => {
    const { resolvePlatformUser } = await import("./platform-bind.js");
    expect(resolvePlatformUser("wechat", "wx_unknown_999")).toBeNull();
  });

  it("bindWechatPlatformUser provisions arbitrary principal", async () => {
    const mod = await import("./platform-bind.js");
    const row = mod.bindWechatPlatformUser("wx_own01", "own01", "dep-gh-pilot-001");
    expect(row.principal_user_id).toBe("own01");
    expect(mod.resolvePlatformUser("wechat", "wx_own01")?.user_id).toBe("own01");
  });

  it("claim pairing code binds user", async () => {
    const mod = await import("./platform-bind.js");
    const issued = mod.issuePairingCode("worker-001");
    const row = mod.claimPairingCode(issued.code, "wechat", "wx_worker_a");
    expect(row.principal_user_id).toBe("worker-001");
    expect(mod.resolvePlatformUser("wechat", "wx_worker_a")?.role).toBe("worker");
  });
});
