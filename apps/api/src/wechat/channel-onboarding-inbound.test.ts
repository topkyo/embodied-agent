import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MqttContext } from "@embodied-agent/node";
import type { WechatIlinkAccount } from "./ilink-store.js";

const mockProcessChatMessage = vi.fn();
const mockSendTextMessage = vi.fn();
const mockFindPlatformBinding = vi.fn();
const mockMarkWechatChannelWelcomeSent = vi.fn();
const mockResolveActiveChannelOnboardingExamples = vi.fn();
const mockResolveWechatPrincipal = vi.fn();
const mockRememberWechatContext = vi.fn();
const mockGetEffectiveSettings = vi.fn(() => ({}));
const mockIsSttConfigured = vi.fn(() => false);

vi.mock("../chat/pipeline.js", () => ({
  processChatMessage: (...args: unknown[]) => mockProcessChatMessage(...args),
  resolveLlmFromSettings: () => ({}),
}));

vi.mock("./ilink-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ilink-client.js")>();
  return {
    ...actual,
    sendTextMessage: (...args: unknown[]) => mockSendTextMessage(...args),
  };
});

vi.mock("../auth/platform-bind.js", () => ({
  findPlatformBinding: (...args: unknown[]) => mockFindPlatformBinding(...args),
  markWechatChannelWelcomeSent: (...args: unknown[]) => mockMarkWechatChannelWelcomeSent(...args),
}));

vi.mock("../chat/channel-onboarding.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../chat/channel-onboarding.js")>();
  return {
    ...actual,
    resolveActiveChannelOnboardingExamples: () => mockResolveActiveChannelOnboardingExamples(),
  };
});

vi.mock("./resolve-wechat-principal.js", () => ({
  resolveWechatPrincipal: (...args: unknown[]) => mockResolveWechatPrincipal(...args),
}));

vi.mock("./outbound.js", () => ({
  rememberWechatContext: (...args: unknown[]) => mockRememberWechatContext(...args),
}));

vi.mock("../settings/store.js", () => ({
  getEffectiveSettings: () => mockGetEffectiveSettings(),
}));

vi.mock("../settings/stt-provider.js", () => ({
  isSttConfigured: () => mockIsSttConfigured(),
}));

const account: WechatIlinkAccount = {
  account_id: "bot@im.bot",
  token: "bridge-token",
  base_url: "http://127.0.0.1:18999",
  linked_user_id: "wx_user@im.wechat",
  principal_user_id: "owner-001",
  saved_at: new Date().toISOString(),
};

const fromUserId = "wx_user@im.wechat";
const contextToken = "ctx-1";
const packExamples = ["1号棚温度多少", "开通风"];
const tipText =
  "已绑定，可以直接发指令。\n试试：\n· 1号棚温度多少\n· 开通风\n回复「帮助」可再次查看。";

describe("wechat inbound channel onboarding", () => {
  beforeEach(async () => {
    vi.resetModules();
    mockProcessChatMessage.mockReset();
    mockSendTextMessage.mockReset();
    mockFindPlatformBinding.mockReset();
    mockMarkWechatChannelWelcomeSent.mockReset();
    mockResolveActiveChannelOnboardingExamples.mockReset();
    mockResolveWechatPrincipal.mockReset();
    mockRememberWechatContext.mockReset();
    mockGetEffectiveSettings.mockClear();
    mockIsSttConfigured.mockReturnValue(false);

    mockResolveWechatPrincipal.mockReturnValue("owner-001");
    mockFindPlatformBinding.mockReturnValue({
      platform: "wechat",
      platform_user_id: fromUserId,
      principal_user_id: "owner-001",
      bound_at: new Date().toISOString(),
    });
    mockResolveActiveChannelOnboardingExamples.mockReturnValue(packExamples);
    mockProcessChatMessage.mockResolvedValue({ reply: "业务回复" });
    mockSendTextMessage.mockResolvedValue(undefined);

    const bridge = await import("./ilink-bridge.js");
    bridge.setWechatBridgeMqttContextForTest({} as MqttContext);
  });

  async function inbound(text: string): Promise<void> {
    const bridge = await import("./ilink-bridge.js");
    await bridge.handleWechatInboundForTest(account, fromUserId, text, contextToken);
  }

  it("first business message: LLM once, tip send ok → mark once", async () => {
    await inbound("1号棚温度多少");

    expect(mockProcessChatMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTextMessage).toHaveBeenCalledTimes(2);
    expect(mockSendTextMessage.mock.calls[0]?.[0]).toMatchObject({ text: "业务回复" });
    expect(mockSendTextMessage.mock.calls[1]?.[0]).toMatchObject({ text: tipText });
    expect(mockMarkWechatChannelWelcomeSent).toHaveBeenCalledTimes(1);
    expect(mockMarkWechatChannelWelcomeSent).toHaveBeenCalledWith(fromUserId);
  });

  it("tip send failure: business reply kept, mark not called", async () => {
    mockSendTextMessage
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("tip send failed"));

    await inbound("1号棚温度多少");

    expect(mockProcessChatMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTextMessage).toHaveBeenCalledTimes(2);
    expect(mockMarkWechatChannelWelcomeSent).not.toHaveBeenCalled();
  });

  it("already marked: one send, no mark", async () => {
    mockFindPlatformBinding.mockReturnValue({
      platform: "wechat",
      platform_user_id: fromUserId,
      principal_user_id: "owner-001",
      bound_at: new Date().toISOString(),
      channel_welcome_sent_at: "2026-07-17T00:00:00.000Z",
    });

    await inbound("1号棚温度多少");

    expect(mockProcessChatMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
    expect(mockMarkWechatChannelWelcomeSent).not.toHaveBeenCalled();
  });

  it("help keyword: no LLM, one tip send, no mark", async () => {
    await inbound("帮助");

    expect(mockProcessChatMessage).not.toHaveBeenCalled();
    expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTextMessage.mock.calls[0]?.[0]).toMatchObject({ text: tipText });
    expect(mockMarkWechatChannelWelcomeSent).not.toHaveBeenCalled();
  });

  it("help then first business: help no mark; business sends tip and marks once", async () => {
    await inbound("帮助");

    expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
    expect(mockMarkWechatChannelWelcomeSent).not.toHaveBeenCalled();

    mockSendTextMessage.mockClear();
    mockProcessChatMessage.mockClear();
    mockMarkWechatChannelWelcomeSent.mockClear();

    await inbound("1号棚温度多少");

    expect(mockProcessChatMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTextMessage).toHaveBeenCalledTimes(2);
    expect(mockMarkWechatChannelWelcomeSent).toHaveBeenCalledTimes(1);
  });

  it("empty text: no tip, no mark", async () => {
    await inbound("");

    expect(mockProcessChatMessage).not.toHaveBeenCalled();
    expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
    expect(mockMarkWechatChannelWelcomeSent).not.toHaveBeenCalled();
  });
});
