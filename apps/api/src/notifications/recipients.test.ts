import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { AlertRule } from "../alerts/threshold-store.js";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { saveWechatAccount } from "../wechat/ilink-store.js";
import { seedDefaultUsers } from "../test/users-fixture.js";

let testDir: string;

describe("wechat recipients repair", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("recipients-repair");
    seedDefaultUsers();
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("listWechatRecipientsByRoles repairs missing binding from wechat-ilink account", async () => {
    saveWechatAccount({
      account_id: "bot-notify@im.bot",
      token: "tok-notify",
      base_url: "https://ilinkai.weixin.qq.com",
      linked_user_id: "wx_notify@im.wechat",
      principal_user_id: "owner-001",
      saved_at: new Date().toISOString(),
    });

    const { listWechatRecipientsByRoles } = await import("./recipients.js");
    const rows = listWechatRecipientsByRoles(["owner"]);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platform_user_id: "wx_notify@im.wechat",
          principal_user_id: "owner-001",
        }),
      ]),
    );

    const bind = await import("../auth/platform-bind.js");
    expect(bind.findPlatformBinding("wechat", "wx_notify@im.wechat")?.principal_user_id).toBe(
      "owner-001",
    );
  });

  it("resolveAlertRecipients repairs rule.updated_by from account-only wechat-ilink", async () => {
    saveWechatAccount({
      account_id: "bot-rule-owner@im.bot",
      token: "tok-rule",
      base_url: "https://ilinkai.weixin.qq.com",
      linked_user_id: "wx_rule_owner@im.wechat",
      principal_user_id: "owner-001",
      saved_at: new Date().toISOString(),
    });

    const rule: AlertRule = {
      entity_id: "gh-1",
      metric: "temperature",
      operator: ">",
      value: 30,
      enabled: true,
      updated_at: new Date().toISOString(),
      updated_by: "owner-001",
    };

    const { resolveAlertRecipients } = await import("./recipients.js");
    const rows = resolveAlertRecipients(rule);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platform_user_id: "wx_rule_owner@im.wechat",
          principal_user_id: "owner-001",
        }),
      ]),
    );
  });
});
