import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { buildApp } from "../app.js";
import { LlmUnavailableError } from "@embodied-agent/agent";
import { saveWechatAccount } from "./ilink-store.js";
import { USER_REPLY } from "../chat/user-messages.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";

const MOCK_PLATFORM_USER = "e2e-wx-user@im.wechat";
const MOCK_BOT_ID = "e2e-bot@im.bot";
const MOCK_TOKEN = "e2e-bot-token";

const mockFetchBotQrcode = vi.fn();
const mockPollQrcodeStatus = vi.fn();

vi.mock("./ilink-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ilink-client.js")>();
  return {
    ...actual,
    fetchBotQrcode: (...args: unknown[]) => mockFetchBotQrcode(...args),
    pollQrcodeStatus: (...args: unknown[]) => mockPollQrcodeStatus(...args),
  };
});

vi.mock("./ilink-bridge.js", () => ({
  restartWechatBridge: vi.fn(),
}));

let testDir: string;

/**
 * 契约：Web 扫码 principal 可自由填写 → 必须写入 platform-bindings，供 wechat-bridge 语音解析。
 * 防止「运维台已连接 / 语音未绑定」双层断裂回归。
 */
describe("wechat bind chain contract", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("wechat-bind-chain");
    vi.resetModules();
    mockFetchBotQrcode.mockReset();
    mockPollQrcodeStatus.mockReset();
    mockFetchBotQrcode.mockResolvedValue({
      ret: 0,
      qrcode: "qr-bind-chain-1",
      qrcode_img_content: "https://liteapp.weixin.qq.com/q/bind-chain",
    });
    mockPollQrcodeStatus.mockResolvedValue({
      status: "confirmed",
      bot_token: MOCK_TOKEN,
      ilink_bot_id: MOCK_BOT_ID,
      ilink_user_id: MOCK_PLATFORM_USER,
      baseurl: "http://127.0.0.1:18999",
    });
  });

  afterEach(() => {
    vi.resetModules();
    releaseAgentDataDir(testDir);
  });

  it("arbitrary principal own01 provisions user and binds wechat platform id", async () => {
    const bind = await import("../auth/platform-bind.js");
    const row = bind.bindWechatPlatformUser(
      "o9cq801ofCZ8PMikiyZJVFXmBtKE@im.wechat",
      "own01",
      "dep-gh-pilot-001",
    );
    expect(row.principal_user_id).toBe("own01");

    const { resolveWechatPrincipal } = await import("./resolve-wechat-principal.js");
    expect(resolveWechatPrincipal("o9cq801ofCZ8PMikiyZJVFXmBtKE@im.wechat")).toBe("own01");

    const users = await import("../auth/users.js");
    expect(users.getUserStrict("own01")?.role).toBe("owner");
  });

  it("advanceWechatLogin confirmed writes account + platform-bindings for arbitrary principal", async () => {
    const { startWechatLogin, advanceWechatLogin, waitForLoginQrcode } =
      await import("./ilink-login.js");

    const session = startWechatLogin({
      principal_user_id: "own01",
      started_by_user_id: "own01",
    });
    await waitForLoginQrcode(session.session_key);
    const advanced = await advanceWechatLogin(session.session_key);
    expect(advanced?.status).toBe("confirmed");
    expect(advanced?.platform_binding_ok).toBe(true);

    const bindingsPath = resolve(testDir, "platform-bindings.json");
    expect(existsSync(bindingsPath)).toBe(true);
    const bindings = JSON.parse(readFileSync(bindingsPath, "utf8")) as {
      bindings: Array<{ platform: string; platform_user_id: string; principal_user_id: string }>;
    };
    expect(bindings.bindings).toContainEqual(
      expect.objectContaining({
        platform: "wechat",
        platform_user_id: MOCK_PLATFORM_USER,
        principal_user_id: "own01",
      }),
    );

    const { resolveWechatPrincipal } = await import("./resolve-wechat-principal.js");
    expect(resolveWechatPrincipal(MOCK_PLATFORM_USER)).toBe("own01");
  });

  it("advanceWechatLogin without deployment_id sets platform_binding_ok false", async () => {
    const store = await import("../settings/store.js");
    const base = store.getEffectiveSettings();
    vi.spyOn(store, "getEffectiveSettings").mockReturnValue({
      ...base,
      deployment_id: "",
    });

    const { startWechatLogin, advanceWechatLogin, waitForLoginQrcode } =
      await import("./ilink-login.js");
    const session = startWechatLogin({
      principal_user_id: "own01",
      started_by_user_id: "own01",
    });
    await waitForLoginQrcode(session.session_key);
    const advanced = await advanceWechatLogin(session.session_key);

    expect(advanced?.platform_binding_ok).toBe(false);
    expect(advanced?.binding_error).toMatch(/deployment_id/);
    expect(existsSync(resolve(testDir, "platform-bindings.json"))).toBe(false);
    expect(existsSync(resolve(testDir, "wechat-ilink"))).toBe(false);
  });

  it("advanceWechatLogin does not save account when bindWechatPlatformUser fails", async () => {
    const bind = await import("../auth/platform-bind.js");
    vi.spyOn(bind, "bindWechatPlatformUser").mockImplementation(() => {
      throw new Error("bind failed for test");
    });

    const { startWechatLogin, advanceWechatLogin, waitForLoginQrcode } =
      await import("./ilink-login.js");
    const session = startWechatLogin({
      principal_user_id: "own01",
      started_by_user_id: "own01",
    });
    await waitForLoginQrcode(session.session_key);
    const advanced = await advanceWechatLogin(session.session_key);

    expect(advanced?.platform_binding_ok).toBe(false);
    expect(existsSync(resolve(testDir, "wechat-ilink"))).toBe(false);
    expect(existsSync(resolve(testDir, "platform-bindings.json"))).toBe(false);
  });

  it("integration chat resolves account-only wechat via repair binding", async () => {
    seedCanonicalSimRegistry();
    saveWechatAccount({
      account_id: MOCK_BOT_ID,
      token: MOCK_TOKEN,
      base_url: "http://127.0.0.1:18999",
      linked_user_id: MOCK_PLATFORM_USER,
      principal_user_id: "own01",
      saved_at: new Date().toISOString(),
    });

    const unavailableLlm = {
      async completeJson() {
        throw new LlmUnavailableError("LLM_API_KEY is not set");
      },
      async completeText() {
        throw new LlmUnavailableError("LLM_API_KEY is not set");
      },
    };

    const app = await buildApp({
      pipeline: {
        llmClient: unavailableLlm,
        model: "unavailable",
        mqttEnabled: false,
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/integrations/chat",
      payload: {
        text: "1号棚现在多少度？",
        user_id: MOCK_PLATFORM_USER,
        platform: "wechat",
      },
    });

    expect(res.statusCode).not.toBe(200);
    expect(res.json().reply).not.toMatch(/尚未绑定/);
    expect(res.json().reply).not.toBe(USER_REPLY.notBound);

    const bind = await import("../auth/platform-bind.js");
    expect(bind.findPlatformBinding("wechat", MOCK_PLATFORM_USER)?.principal_user_id).toBe("own01");
    await app.close();
  });
});
