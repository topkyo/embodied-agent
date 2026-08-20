import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { setAlertRule } from "./threshold-store.js";
import { evaluateAndPushAlerts } from "./push.js";
import { ingestHeartbeatMessage, upsertTelemetry } from "../telemetry/store.js";
import { upsertBinding } from "../auth/platform-bind.js";
import { rememberWechatContext } from "../wechat/outbound.js";
import { saveWechatAccount } from "../wechat/ilink-store.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import { seedDefaultUsers } from "../test/users-fixture.js";

let testDir: string;

describe("alert push", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    process.env.SUSTAINED_ALERTS = "0";
    seedCanonicalSimRegistry();
    seedDefaultUsers();
    saveWechatAccount({
      account_id: "acct-1",
      token: "test-token",
      base_url: "https://ilinkai.weixin.qq.com",
      saved_at: new Date().toISOString(),
    });
    upsertBinding("wechat", "wx-owner", "owner-001");
    rememberWechatContext("acct-1", "wx-owner", "ctx-1");
    setAlertRule({
      entity_id: "gh-001",
      metric: "temperature_c",
      operator: ">",
      value: 30,
      updated_by: "owner-001",
    });
    upsertTelemetry([
      {
        entity_id: "gh-001",
        temperature_c: 31,
        humidity_percent: 70,
        vent_status: "closed",
        fan_status: "off",
      },
    ]);
  });
  afterEach(() => {
    delete process.env.SUSTAINED_ALERTS;
    releaseAgentDataDir(testDir);
  });

  it("fires push when telemetry breaches rule", async () => {
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
    const sent: Array<{ to: string; text: string }> = [];
    const n = await evaluateAndPushAlerts(async (to, text) => {
      sent.push({ to, text });
      return true;
    });
    expect(n).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("wx-owner");
    expect(sent[0]!.text).toContain("【报警】");
  });

  it("respects cooldown", async () => {
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
    const send = async () => true;
    expect(await evaluateAndPushAlerts(send)).toBe(1);
    expect(await evaluateAndPushAlerts(send)).toBe(0);
  });

  it("skips push when greenhouse nodes are offline", async () => {
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
    const sent: Array<{ to: string; text: string }> = [];
    const n = await evaluateAndPushAlerts(async (to, text) => {
      sent.push({ to, text });
      return true;
    }, Date.now() + 120_000);
    expect(n).toBe(0);
    expect(sent).toHaveLength(0);
  });
});
