import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import type { MqttContext } from "@embodied-agent/node";

const mockGetUpdates = vi.fn();

vi.mock("./ilink-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ilink-client.js")>();
  return {
    ...actual,
    getUpdates: (...args: unknown[]) => mockGetUpdates(...args),
  };
});

let testDir: string;

/**
 * 契约：首次部署 bootstrap 时还没有微信账号（未扫码），扫码成功后
 * restartWechatBridge() 必须能把桥接拉起来 —— 不允许「扫码成功但桥接
 * 直到 API 重启才运行」的断裂。
 */
describe("wechat bridge first-bind start contract", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("ilink-bridge");
    vi.resetModules();
    mockGetUpdates.mockReset();
    // pollLoop 会一直空转：返回空消息即可
    mockGetUpdates.mockResolvedValue({ msgs: [], get_updates_buf: "" });
  });

  afterEach(async () => {
    // 断言失败时也要停掉 pollLoop，避免残留到其他用例
    const bridge = await import("./ilink-bridge.js");
    bridge.stopWechatBridge();
    vi.resetModules();
    releaseAgentDataDir(testDir);
  });

  it("restartWechatBridge starts the bridge after first QR bind even when bootstrap saw no account", async () => {
    const bridge = await import("./ilink-bridge.js");
    const { saveWechatAccount } = await import("./ilink-store.js");
    const mqttCtx = {} as MqttContext;

    // bootstrap：无账号 → 桥接不启动，但必须记住 mqttCtx
    bridge.startWechatBridgeIfConfigured(mqttCtx);
    expect(bridge.isWechatBridgeRunning()).toBe(false);

    // 扫码成功：保存账号后 ilink-login 调 restartWechatBridge()
    saveWechatAccount({
      account_id: "first-bind@im.bot",
      token: "first-bind-token",
      base_url: "http://127.0.0.1:18999",
      linked_user_id: "user@im.wechat",
      principal_user_id: "own01",
      saved_at: new Date().toISOString(),
    });
    bridge.restartWechatBridge();

    expect(bridge.isWechatBridgeRunning()).toBe(true);
    bridge.stopWechatBridge();
  });
});
