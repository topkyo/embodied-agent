import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getZonedDateParts, tickDigestScheduler } from "./scheduler.js";
import { clearDigestState } from "./state.js";
import { upsertBinding } from "../auth/platform-bind.js";
import { rememberWechatContext } from "../wechat/outbound.js";
import { saveWechatAccount } from "../wechat/ilink-store.js";
import * as proactiveSend from "../channels/proactive-send.js";
import { seedDefaultUsers } from "../test/users-fixture.js";

let testDir: string;

describe("digest scheduler", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    writeFileSync(
      resolve(testDir, "settings.json"),
      JSON.stringify({
        deployment_name: "示例现场",
        deployment_id: "dep-gh-pilot-001",
        digest_enabled: true,
        digest_morning_hour: 7,
        digest_evening_hour: 22,
        digest_timezone: "Asia/Shanghai",
      }),
      "utf8",
    );
    seedDefaultUsers();
    saveWechatAccount({
      account_id: "acct-1",
      token: "test-token",
      base_url: "https://ilinkai.weixin.qq.com",
      saved_at: new Date().toISOString(),
    });
    upsertBinding("wechat", "wx-owner", "owner-001");
    rememberWechatContext("acct-1", "wx-owner", "ctx-1");
    clearDigestState();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    releaseAgentDataDir(testDir);
  });

  it("parses timezone parts", () => {
    const parts = getZonedDateParts("Asia/Shanghai", new Date("2026-06-04T23:00:00.000Z"));
    expect(parts.hour).toBeGreaterThanOrEqual(0);
    expect(parts.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("sends morning digest at 07:00 Shanghai", async () => {
    const send = vi.spyOn(proactiveSend, "defaultProactiveSend").mockResolvedValue(true);
    await tickDigestScheduler(new Date("2026-06-03T23:00:00.000Z"));
    expect(send).toHaveBeenCalled();
    expect(send.mock.calls[0]?.[1]).toContain("【晨间简报】");
    await tickDigestScheduler(new Date("2026-06-03T23:00:00.000Z"));
    expect(send).toHaveBeenCalledTimes(1);
  });
});
