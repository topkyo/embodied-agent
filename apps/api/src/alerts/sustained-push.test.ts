import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { setAlertRule, removeAlertRulesForEntity } from "./threshold-store.js";
import { resetTelemetryCacheForTests, upsertTelemetry } from "../telemetry/store.js";
import { clearSustainedState } from "./sustained-state.js";
import { clearAlertCooldown } from "./alert-state.js";
import { clearAlertEventsForTest, queryAlertEventsToday } from "./alert-events.js";
import { evaluateSustainedAlerts } from "./sustained-push.js";
import { getPendingConfirmForUser } from "../policy/pending-confirm.js";
import { clearAllPendingConfirm } from "../policy/pending-confirm.js";
import { upsertBinding } from "../auth/platform-bind.js";
import { ingestHeartbeatMessage } from "../telemetry/store.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import { seedDefaultUsers } from "../test/users-fixture.js";

let testDir: string;

describe("evaluateSustainedAlerts", () => {
  beforeEach(async () => {
    testDir = allocateAgentDataDir("test");
    process.env.SUSTAINED_ALERT_MINUTES = "3";
    process.env.SUSTAINED_ALERTS = "1";
    seedCanonicalSimRegistry();
    seedDefaultUsers();
    removeAlertRulesForEntity("gh-001");
    removeAlertRulesForEntity("gh-002");
    await clearSustainedState();
    clearAllPendingConfirm();
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
        temperature_c: 32,
        humidity_percent: 70,
        vent_status: "closed",
        fan_status: "off",
      },
    ]);
    upsertBinding("wechat", "wx-owner", "owner-001");
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
  });
  afterEach(async () => {
    removeAlertRulesForEntity("gh-001");
    removeAlertRulesForEntity("gh-002");
    await clearSustainedState();
    clearAllPendingConfirm();
    delete process.env.SUSTAINED_ALERT_MINUTES;
    delete process.env.SUSTAINED_ALERTS;
    releaseAgentDataDir(testDir);
  });

  it("appends recovery event when sustained breach clears after L1", async () => {
    clearAlertEventsForTest("dep-gh-pilot-001");
    const { saveWechatAccount } = await import("../wechat/ilink-store.js");
    saveWechatAccount({
      account_id: "wx-test",
      base_url: "http://127.0.0.1",
      token: "tok",
      saved_at: new Date().toISOString(),
    });
    const send = async () => true;

    for (let i = 0; i < 3; i++) {
      ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
      await evaluateSustainedAlerts(send);
    }

    upsertTelemetry([
      {
        entity_id: "gh-001",
        temperature_c: 24,
        humidity_percent: 70,
        vent_status: "closed",
        fan_status: "off",
      },
    ]);
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
    await evaluateSustainedAlerts(send);

    const events = queryAlertEventsToday("dep-gh-pilot-001", "gh-001");
    expect(events.some((e) => e.event_type === "sustained_threshold")).toBe(true);
    expect(events.some((e) => e.event_type === "recovery")).toBe(true);
  });

  it("does not append recovery when evaluation skipped for offline node", async () => {
    clearAlertEventsForTest("dep-gh-pilot-001");
    const { saveWechatAccount } = await import("../wechat/ilink-store.js");
    saveWechatAccount({
      account_id: "wx-test",
      base_url: "http://127.0.0.1",
      token: "tok",
      saved_at: new Date().toISOString(),
    });
    const send = async () => true;

    for (let i = 0; i < 3; i++) {
      ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
      await evaluateSustainedAlerts(send);
    }

    resetTelemetryCacheForTests();
    upsertTelemetry([
      {
        entity_id: "gh-001",
        temperature_c: 32,
        humidity_percent: 70,
        vent_status: "closed",
        fan_status: "off",
      },
    ]);
    await evaluateSustainedAlerts(send);

    const events = queryAlertEventsToday("dep-gh-pilot-001", "gh-001");
    expect(events.some((e) => e.event_type === "sustained_threshold")).toBe(true);
    expect(events.some((e) => e.event_type === "recovery")).toBe(false);
  });

  it("fires L1 after sustained minutes then L2 with pending confirm", async () => {
    const sent: string[] = [];
    const send = async (_uid: string, text: string) => {
      sent.push(text);
      return true;
    };

    // mock wechat account file - evaluateSustained checks loadPrimaryWechatAccount
    const { saveWechatAccount } = await import("../wechat/ilink-store.js");
    saveWechatAccount({
      account_id: "wx-test",
      base_url: "http://127.0.0.1",
      token: "tok",
      saved_at: new Date().toISOString(),
    });

    let l1 = 0;
    let l2 = 0;
    for (let i = 0; i < 3; i++) {
      ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
      const r = await evaluateSustainedAlerts(send);
      l1 += r.l1;
      l2 += r.l2;
    }
    expect(l1).toBe(1);
    expect(l2).toBe(1);
    expect(sent.some((m) => m.includes("持续异常"))).toBe(true);
    expect(sent.some((m) => m.includes("运营建议"))).toBe(true);

    const pending = getPendingConfirmForUser("owner-001");
    expect(pending?.intent.skill).toBe("greenhouse.set_mode");
  });

  it("suggests fan.start for emergency heat when fan exists", async () => {
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
        temperature_c: 36,
        humidity_percent: 70,
        vent_status: "closed",
        fan_status: "off",
      },
    ]);

    const { saveWechatAccount } = await import("../wechat/ilink-store.js");
    saveWechatAccount({
      account_id: "wx-test",
      base_url: "http://127.0.0.1",
      token: "tok",
      saved_at: new Date().toISOString(),
    });

    const sent: string[] = [];
    const send = async (_uid: string, text: string) => {
      sent.push(text);
      return true;
    };

    for (let i = 0; i < 3; i++) {
      ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
      await evaluateSustainedAlerts(send);
    }
    await clearAlertCooldown("sustained-l2:dep-gh-pilot-001:gh-001:temperature_c:>:30");
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
    await evaluateSustainedAlerts(send);

    expect(sent.some((m) => m.includes("高温应急"))).toBe(true);
    expect(sent.some((m) => m.includes("风机"))).toBe(true);
    const pending = getPendingConfirmForUser("owner-001");
    expect(pending?.intent.skill).toBe("fan.start");
  });

  it("suggests open_vent for emergency heat when no fan registered", async () => {
    const { loadRegistry, saveRegistry } = await import("@embodied-agent/node");
    const registry = loadRegistry();
    saveRegistry({
      ...registry,
      devices: registry.devices.filter((d) => d.device_type !== "fan"),
    });

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
        temperature_c: 36,
        humidity_percent: 70,
        vent_status: "closed",
        fan_status: "off",
      },
    ]);

    const { saveWechatAccount } = await import("../wechat/ilink-store.js");
    saveWechatAccount({
      account_id: "wx-test",
      base_url: "http://127.0.0.1",
      token: "tok",
      saved_at: new Date().toISOString(),
    });

    const sent: string[] = [];
    const send = async (_uid: string, text: string) => {
      sent.push(text);
      return true;
    };

    for (let i = 0; i < 3; i++) {
      ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
      await evaluateSustainedAlerts(send);
    }
    await clearAlertCooldown("sustained-l2:dep-gh-pilot-001:gh-001:temperature_c:>:30");
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
    await evaluateSustainedAlerts(send);

    expect(sent.some((m) => m.includes("未配置风机"))).toBe(true);
    const pending = getPendingConfirmForUser("owner-001");
    expect(pending?.intent.skill).toBe("greenhouse.open_vent");
  });
});
