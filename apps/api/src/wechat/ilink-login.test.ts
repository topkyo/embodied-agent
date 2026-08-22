import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";

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

describe("wechat ilink login", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("ilink-login");
    vi.resetModules();
    mockFetchBotQrcode.mockReset();
    mockPollQrcodeStatus.mockReset();
    mockFetchBotQrcode.mockResolvedValue({
      ret: 0,
      qrcode: "qr-test-1",
      qrcode_img_content: "https://liteapp.weixin.qq.com/q/test",
    });
    mockPollQrcodeStatus.mockResolvedValue({
      status: "confirmed",
      bot_token: "tok-confirmed",
      ilink_bot_id: "bot-confirmed@im.bot",
      ilink_user_id: "wx-confirmed@im.wechat",
    });
  });

  afterEach(() => {
    vi.resetModules();
    releaseAgentDataDir(testDir);
  });

  it("stores optional domain on session", async () => {
    const { startWechatLogin, publicLoginView } = await import("./ilink-login.js");
    const session = startWechatLogin({
      principal_user_id: "owner-001",
      started_by_user_id: "owner-001",
      domain: "greenhouse",
    });
    expect(session.domain).toBe("greenhouse");
    expect(publicLoginView(session).domain).toBe("greenhouse");
  });

  it("starts login and returns session with qrcode content after fetch", async () => {
    const { startWechatLogin, waitForLoginQrcode } = await import("./ilink-login.js");
    const session = startWechatLogin({
      principal_user_id: "owner-001",
      started_by_user_id: "owner-001",
    });
    expect(session.session_key).toMatch(/[0-9a-f-]{36}/);
    const ready = await waitForLoginQrcode(session.session_key);
    expect(ready?.qrcode_content).toContain("liteapp.weixin.qq.com");
  });

  it("requires explicit principal_user_id", async () => {
    const { startWechatLogin } = await import("./ilink-login.js");
    expect(() => startWechatLogin({})).toThrow(/principal_user_id/);
  });

  it("rejects start when STATE_BACKEND=redis (multi-instance deployment)", async () => {
    const prev = process.env.STATE_BACKEND;
    process.env.STATE_BACKEND = "redis";
    try {
      const { startWechatLogin } = await import("./ilink-login.js");
      expect(() =>
        startWechatLogin({ principal_user_id: "owner-001", started_by_user_id: "owner-001" }),
      ).toThrow(/进程内状态.*多实例部署/);
    } finally {
      if (prev === undefined) delete process.env.STATE_BACKEND;
      else process.env.STATE_BACKEND = prev;
    }
  });

  it("confirmed scan binds platform user and clears session", async () => {
    const { startWechatLogin, advanceWechatLogin, waitForLoginQrcode, getLoginSession } =
      await import("./ilink-login.js");
    const session = startWechatLogin({
      principal_user_id: "owner-001",
      started_by_user_id: "owner-001",
    });
    await waitForLoginQrcode(session.session_key);
    const advanced = await advanceWechatLogin(session.session_key);

    expect(advanced?.status).toBe("confirmed");
    expect(advanced?.platform_binding_ok).toBe(true);
    expect(getLoginSession(session.session_key)).toBeNull();

    const bindingsPath = resolve(testDir, "platform-bindings.json");
    expect(existsSync(bindingsPath)).toBe(true);
    const file = JSON.parse(readFileSync(bindingsPath, "utf8")) as {
      bindings: Array<{ platform_user_id: string; principal_user_id: string }>;
    };
    expect(file.bindings[0]?.platform_user_id).toBe("wx-confirmed@im.wechat");
    expect(file.bindings[0]?.principal_user_id).toBe("owner-001");
  });

  it("confirmed scan sets platform_binding_ok false when settings unreadable", async () => {
    const store = await import("../settings/store.js");
    vi.spyOn(store, "getEffectiveSettings").mockImplementation(() => {
      throw new Error("settings corrupt");
    });

    const { startWechatLogin, advanceWechatLogin, waitForLoginQrcode } =
      await import("./ilink-login.js");
    const session = startWechatLogin({
      principal_user_id: "owner-001",
      started_by_user_id: "owner-001",
    });
    await waitForLoginQrcode(session.session_key);
    const advanced = await advanceWechatLogin(session.session_key);

    expect(advanced?.platform_binding_ok).toBe(false);
    expect(advanced?.binding_error).toMatch(/deployment_id/);
    expect(existsSync(resolve(testDir, "platform-bindings.json"))).toBe(false);
    expect(existsSync(resolve(testDir, "wechat-ilink"))).toBe(false);
  });

  it("wechatLoginPollFlags aligns connected with clawbot and im binding", async () => {
    const { wechatLoginPollFlags } = await import("./ilink-login.js");
    expect(wechatLoginPollFlags({ status: "confirmed", platform_binding_ok: true })).toEqual({
      clawbot_connected: true,
      im_binding_ok: true,
      connected: true,
    });
    expect(wechatLoginPollFlags({ status: "confirmed", platform_binding_ok: false })).toEqual({
      clawbot_connected: true,
      im_binding_ok: false,
      connected: false,
    });
    expect(wechatLoginPollFlags({ status: "scaned", platform_binding_ok: null })).toEqual({
      clawbot_connected: false,
      im_binding_ok: false,
      connected: false,
    });
  });
});
