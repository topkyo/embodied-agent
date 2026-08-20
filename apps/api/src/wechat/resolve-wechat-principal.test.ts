import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { saveWechatAccount } from "./ilink-store.js";

let testDir: string;

describe("resolveWechatPrincipal", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("resolve-wechat-principal");
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("resolves from platform-bindings when present", async () => {
    const bind = await import("../auth/platform-bind.js");
    const { seedDefaultUsers } = await import("../test/users-fixture.js");
    seedDefaultUsers();
    bind.bindWechatPlatformUser("wx-bound-1", "owner-001", "dep-gh-pilot-001");

    const { resolveWechatPrincipal } = await import("./resolve-wechat-principal.js");
    expect(resolveWechatPrincipal("wx-bound-1")).toBe("owner-001");
  });

  it("repairs binding from wechat-ilink account when platform-bindings missing", async () => {
    saveWechatAccount({
      account_id: "bot-repair@im.bot",
      token: "bot-repair@im.bot:token",
      base_url: "https://ilinkai.weixin.qq.com",
      linked_user_id: "wx_repair_user@im.wechat",
      principal_user_id: "own01",
      saved_at: new Date().toISOString(),
    });

    const { resolveWechatPrincipal } = await import("./resolve-wechat-principal.js");
    expect(resolveWechatPrincipal("wx_repair_user@im.wechat")).toBe("own01");

    const bind = await import("../auth/platform-bind.js");
    const row = bind.findPlatformBinding("wechat", "wx_repair_user@im.wechat");
    expect(row?.principal_user_id).toBe("own01");
  });

  it("returns null when account exists but deployment_id missing", async () => {
    delete process.env.DEPLOYMENT_ID;
    const settingsPath = resolve(testDir, "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    delete settings.deployment_id;
    writeFileSync(settingsPath, JSON.stringify(settings));

    saveWechatAccount({
      account_id: "bot-nodep@im.bot",
      token: "tok",
      base_url: "https://ilinkai.weixin.qq.com",
      linked_user_id: "wx_no_dep@im.wechat",
      principal_user_id: "own01",
      saved_at: new Date().toISOString(),
    });

    const { resolveWechatPrincipal } = await import("./resolve-wechat-principal.js");
    expect(resolveWechatPrincipal("wx_no_dep@im.wechat")).toBeNull();
  });

  it("listMissingWechatBindings lists account-only rows", async () => {
    saveWechatAccount({
      account_id: "bot-list@im.bot",
      token: "tok",
      base_url: "https://ilinkai.weixin.qq.com",
      linked_user_id: "wx_list@im.wechat",
      principal_user_id: "own01",
      saved_at: new Date().toISOString(),
    });

    const { listMissingWechatBindings } = await import("./resolve-wechat-principal.js");
    expect(listMissingWechatBindings()).toEqual([
      {
        platform_user_id: "wx_list@im.wechat",
        principal_user_id: "own01",
        account_id: "bot-list@im.bot",
      },
    ]);
  });

  it("returns null when repair bind fails", async () => {
    saveWechatAccount({
      account_id: "bot-bind-fail@im.bot",
      token: "tok",
      base_url: "https://ilinkai.weixin.qq.com",
      linked_user_id: "wx_bind_fail@im.wechat",
      principal_user_id: "own01",
      saved_at: new Date().toISOString(),
    });

    const bind = await import("../auth/platform-bind.js");
    vi.spyOn(bind, "bindWechatPlatformUser").mockImplementation(() => {
      throw new Error("bind failed for test");
    });

    const { resolveWechatPrincipal } = await import("./resolve-wechat-principal.js");
    expect(resolveWechatPrincipal("wx_bind_fail@im.wechat")).toBeNull();
  });
});
