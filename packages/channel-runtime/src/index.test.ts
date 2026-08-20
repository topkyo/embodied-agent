import { describe, expect, it } from "vitest";
import {
  createChatChannelRegistry,
  getRegisteredChatChannel,
  listRegisteredChatChannelIds,
  type ChatChannel,
} from "./index.js";

function makeChannel(id: string): ChatChannel {
  return {
    id,
    verifySignature: () => true,
    normalizeInbound: (body) => ({
      platform: id,
      conversation_id: String(body.conversation_id ?? "c1"),
      user_id: String(body.user_id ?? "u1"),
      text: String(body.text ?? ""),
      timestamp: "t",
    }),
    sendReply: async () => undefined,
  };
}

describe("chat channel registry", () => {
  it("registers channels by id", () => {
    const registry = createChatChannelRegistry([makeChannel("wechat"), makeChannel("dev")]);
    expect(listRegisteredChatChannelIds(registry).sort()).toEqual(["dev", "wechat"]);
    expect(getRegisteredChatChannel(registry, "wechat")?.id).toBe("wechat");
  });

  it("returns undefined for unknown channel id", () => {
    const registry = createChatChannelRegistry([makeChannel("wechat")]);
    expect(getRegisteredChatChannel(registry, "missing")).toBeUndefined();
  });

  it("overwrites duplicate ids with the last registered channel", () => {
    const first = makeChannel("wechat");
    const second = {
      ...makeChannel("wechat"),
      verifySignature: () => false,
    };
    const registry = createChatChannelRegistry([first, second]);
    expect(getRegisteredChatChannel(registry, "wechat")?.verifySignature({}, {})).toBe(false);
    expect(listRegisteredChatChannelIds(registry)).toEqual(["wechat"]);
  });
});
