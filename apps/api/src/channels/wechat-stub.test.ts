import { describe, expect, it, vi } from "vitest";
import { wechatStubChannel } from "./wechat-stub.js";
import { getChatChannel, listRegisteredChannels, resolveChatChannelId } from "./registry.js";

describe("wechat-stub channel", () => {
  it("skips signature verification in dev", () => {
    expect(wechatStubChannel.verifySignature({}, {})).toBe(true);
  });

  it("normalizes WeChat-style payload", () => {
    const msg = wechatStubChannel.normalizeInbound({
      FromUserName: "owner-001",
      ToUserName: "farm-bot",
      Content: "1号棚现在多少度？",
    });
    expect(msg.platform).toBe("wechat-stub");
    expect(msg.user_id).toBe("owner-001");
    expect(msg.text).toBe("1号棚现在多少度？");
  });

  it("sendReply writes to stdout", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await wechatStubChannel.sendReply(
      {
        platform: "wechat-stub",
        user_id: "owner-001",
        conversation_id: "wx-1",
        text: "hi",
        timestamp: new Date().toISOString(),
      },
      "31.2°C",
    );
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("wechat-stub"));
    spy.mockRestore();
  });
});

describe("channel registry", () => {
  it("registers only domestic stub channels", () => {
    expect(listRegisteredChannels()).toEqual(["wechat-stub"]);
  });

  it("defaults to dev when CHAT_CHANNEL unset", () => {
    delete process.env.CHAT_CHANNEL;
    expect(resolveChatChannelId()).toBe("dev");
    expect(getChatChannel()).toBeUndefined();
  });

  it("resolves wechat-stub channel", () => {
    process.env.CHAT_CHANNEL = "wechat-stub";
    expect(getChatChannel()?.id).toBe("wechat-stub");
    delete process.env.CHAT_CHANNEL;
  });
});
