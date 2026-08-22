import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seedDefaultUsers } from "../test/users-fixture.js";

const mockLogError = vi.fn();
const mockLogInfo = vi.fn();
let writeShouldFail = false;

vi.mock("@embodied-agent/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@embodied-agent/platform")>();
  return {
    ...actual,
    createLogger: () => ({
      info: mockLogInfo,
      warn: vi.fn(),
      error: mockLogError,
      debug: vi.fn(),
    }),
    atomicWriteJson: (path: string, data: unknown) => {
      if (writeShouldFail) {
        throw new Error("disk full");
      }
      return actual.atomicWriteJson(path, data);
    },
  };
});

let testDir: string;

describe("platform-bind channel_welcome_sent_at", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("platform-bind-welcome");
    seedDefaultUsers();
    mockLogError.mockClear();
    mockLogInfo.mockClear();
    writeShouldFail = false;
    vi.resetModules();
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("markWechatChannelWelcomeSent sets channel_welcome_sent_at on binding", async () => {
    const mod = await import("./platform-bind.js");
    mod.upsertBinding("wechat", "wx_welcome_1", "owner-001");

    mod.markWechatChannelWelcomeSent("wx_welcome_1");

    const row = mod.findPlatformBinding("wechat", "wx_welcome_1");
    expect(row?.channel_welcome_sent_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("markWechatChannelWelcomeSent no-ops when binding is missing", async () => {
    const mod = await import("./platform-bind.js");

    expect(() => mod.markWechatChannelWelcomeSent("wx_missing")).not.toThrow();
    expect(mockLogInfo).toHaveBeenCalledWith(
      "channel welcome mark skipped: binding not found",
      expect.objectContaining({ platform: "wechat", platformUserId: "wx_missing" }),
    );
  });

  it("upsertBinding preserves channel_welcome_sent_at for same principal", async () => {
    const mod = await import("./platform-bind.js");
    mod.upsertBinding("wechat", "wx_preserve", "owner-001");
    mod.markWechatChannelWelcomeSent("wx_preserve");
    const before = mod.findPlatformBinding("wechat", "wx_preserve")?.channel_welcome_sent_at;

    mod.upsertBinding("wechat", "wx_preserve", "owner-001");

    const after = mod.findPlatformBinding("wechat", "wx_preserve");
    expect(after?.channel_welcome_sent_at).toBe(before);
  });

  it("upsertBinding clears channel_welcome_sent_at when principal changes", async () => {
    const mod = await import("./platform-bind.js");
    mod.upsertBinding("wechat", "wx_clear", "owner-001");
    mod.markWechatChannelWelcomeSent("wx_clear");
    expect(mod.findPlatformBinding("wechat", "wx_clear")?.channel_welcome_sent_at).toBeTruthy();

    mod.upsertBinding("wechat", "wx_clear", "worker-001");

    const row = mod.findPlatformBinding("wechat", "wx_clear");
    expect(row?.principal_user_id).toBe("worker-001");
    expect(row?.channel_welcome_sent_at).toBeUndefined();
  });

  it("markWechatChannelWelcomeSent logs and does not throw on write failure", async () => {
    const mod = await import("./platform-bind.js");
    mod.upsertBinding("wechat", "wx_write_fail", "owner-001");
    writeShouldFail = true;

    expect(() => mod.markWechatChannelWelcomeSent("wx_write_fail")).not.toThrow();
    expect(mockLogError).toHaveBeenCalledWith(
      "channel welcome mark write failed",
      expect.objectContaining({ platform: "wechat", platformUserId: "wx_write_fail" }),
    );
    expect(mod.findPlatformBinding("wechat", "wx_write_fail")?.channel_welcome_sent_at).toBeUndefined();
  });
});
