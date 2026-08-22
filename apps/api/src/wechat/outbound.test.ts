import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isFlywheelDevBypass,
  proactiveWechatSendReady,
  sendProactiveWechatText,
} from "./outbound.js";

const sendTextMessage = vi.fn();

vi.mock("./ilink-client.js", () => ({
  sendTextMessage: (...args: unknown[]) => sendTextMessage(...args),
}));

vi.mock("./context-store.js", () => ({
  getWechatContextToken: () => "ctx",
  setWechatContextToken: vi.fn(),
}));

vi.mock("./ilink-store.js", () => ({
  loadPrimaryWechatAccount: () => null,
}));

describe("wechat outbound flywheel dev", () => {
  beforeEach(() => {
    sendTextMessage.mockReset();
    delete process.env.FLYWHEEL_DEV;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    delete process.env.FLYWHEEL_DEV;
    delete process.env.NODE_ENV;
  });

  it("isFlywheelDevBypass only in non-production", () => {
    process.env.FLYWHEEL_DEV = "1";
    process.env.NODE_ENV = "test";
    expect(isFlywheelDevBypass()).toBe(true);
    process.env.NODE_ENV = "production";
    expect(isFlywheelDevBypass()).toBe(false);
  });

  it("proactiveWechatSendReady without token when flywheel dev", () => {
    process.env.FLYWHEEL_DEV = "1";
    process.env.NODE_ENV = "test";
    expect(proactiveWechatSendReady(null)).toBe(true);
  });

  it("sendProactiveWechatText skips HTTP under flywheel dev", async () => {
    process.env.FLYWHEEL_DEV = "1";
    process.env.NODE_ENV = "test";
    const ok = await sendProactiveWechatText("wx-user", "hello");
    expect(ok).toBe(true);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });
});
