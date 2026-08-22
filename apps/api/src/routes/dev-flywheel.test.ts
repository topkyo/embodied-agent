import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import { saveSettings } from "../settings/store.js";
import { ingestHeartbeatMessage, upsertTelemetry } from "../telemetry/store.js";

let testDir: string;

describe("dev flywheel routes", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    process.env.NODE_ENV = "test";
    saveSettings({
      deployment_id: "dep-gh-pilot-001",
      active_domain: "agriculture",
      domain_configs: {
        agriculture: {
          flywheel_greenhouse_ids: ["gh-001", "gh-002"],
        },
      },
    });
    seedCanonicalSimRegistry();
    upsertTelemetry([
      {
        entity_id: "gh-001",
        temperature_c: 22,
        humidity_percent: 88,
        vent_status: "closed",
        fan_status: "off",
      },
      {
        entity_id: "gh-002",
        temperature_c: 36,
        humidity_percent: 55,
        vent_status: "closed",
        fan_status: "off",
      },
    ]);
  });
  afterEach(() => {
    delete process.env.FLYWHEEL_DEV;
    delete process.env.NODE_ENV;
    releaseAgentDataDir(testDir);
  });

  it("reset-state clears pending and alert rules when FLYWHEEL_DEV", async () => {
    process.env.FLYWHEEL_DEV = "1";
    const app = await buildApp();
    const { setPendingConfirm } = await import("../policy/pending-confirm.js");
    const { setAlertRule } = await import("../alerts/threshold-store.js");
    setPendingConfirm({
      intent: {
        skill: "greenhouse.open_vent",
        target: { greenhouse_id: "gh-001" },
        parameters: { duration_seconds: 60 },
        confidence: 0.9,
      },
      user_id: "owner-001",
      conversation_id: "wx-test",
      model: "deepseek-v4-flash",
    });
    setAlertRule({
      entity_id: "gh-001",
      metric: "humidity_percent",
      operator: ">",
      value: 85,
      updated_by: "owner-001",
      enabled: true,
    });
    const res = await app.inject({
      method: "POST",
      url: "/dev/flywheel/reset-state",
    });
    expect(res.statusCode).toBe(200);
    const { listPendingConfirmsForUser } = await import("../policy/pending-confirm.js");
    const { listAlertRules } = await import("../alerts/threshold-store.js");
    expect(listPendingConfirmsForUser("owner-001")).toHaveLength(0);
    expect(listAlertRules()).toHaveLength(0);
    await app.close();
  });

  it("clear-pending removes one scene row when FLYWHEEL_DEV", async () => {
    process.env.FLYWHEEL_DEV = "1";
    const app = await buildApp();
    const { setPendingConfirm, listPendingConfirmsForUser } =
      await import("../policy/pending-confirm.js");
    setPendingConfirm({
      intent: {
        skill: "fan.start",
        target: { greenhouse_id: "gh-002", fan_id: "fan-sim-gh-002" },
        parameters: { duration_seconds: 600 },
        confidence: 0.9,
      },
      user_id: "owner-001",
      conversation_id: "wx-flywheel-dev",
      model: "deepseek-v4-flash",
      scene_skill_id: "high_temp_emergency_response",
    });
    setPendingConfirm({
      intent: {
        skill: "greenhouse.open_vent",
        target: { greenhouse_id: "gh-001" },
        parameters: { duration_seconds: 600 },
        confidence: 0.9,
      },
      user_id: "owner-001",
      conversation_id: "wx-flywheel-dev",
      model: "deepseek-v4-flash",
      scene_skill_id: "humidity_mildew_prevention",
    });
    const res = await app.inject({
      method: "POST",
      url: "/dev/flywheel/clear-pending",
      payload: {
        user_id: "owner-001",
        conversation_id: "wx-flywheel-dev",
        scene_skill_id: "high_temp_emergency_response",
      },
    });
    expect(res.statusCode).toBe(200);
    const rows = listPendingConfirmsForUser("owner-001");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.scene_skill_id).toBe("humidity_mildew_prevention");
    await app.close();
  });

  it("ready requires FLYWHEEL_DEV", async () => {
    const app = await buildApp();
    const denied = await app.inject({ method: "GET", url: "/dev/flywheel/ready" });
    expect(denied.statusCode).toBe(400);

    process.env.FLYWHEEL_DEV = "1";
    const allowed = await app.inject({ method: "GET", url: "/dev/flywheel/ready" });
    expect(allowed.statusCode).toBe(200);
    await app.close();
  });

  it("ready false without fresh sim heartbeats", async () => {
    process.env.FLYWHEEL_DEV = "1";
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/dev/flywheel/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      ready: false,
      telemetry_ready: true,
      nodes_online: false,
    });
    await app.close();
  });

  it("ready true with telemetry and fresh heartbeats", async () => {
    process.env.FLYWHEEL_DEV = "1";
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001", config_version: 1 });
    ingestHeartbeatMessage({ node_id: "node-sim-gh-002", config_version: 1 });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/dev/flywheel/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      ready: true,
      entities: ["gh-001", "gh-002"],
      nodes_online: true,
    });
    expect(
      res.json().checks.find((check: { id: string }) => check.id === "greenhouse_sustained_alerts")
        ?.ok,
    ).toBe(true);
    await app.close();
  });

  it("weather-proactive requires FLYWHEEL_DEV", async () => {
    const app = await buildApp();
    const denied = await app.inject({
      method: "POST",
      url: "/dev/flywheel/weather-proactive",
      payload: { force_heat: true },
    });
    expect(denied.statusCode).toBe(400);

    process.env.FLYWHEEL_DEV = "1";
    const allowed = await app.inject({
      method: "POST",
      url: "/dev/flywheel/weather-proactive",
      payload: { force_heat: true },
    });
    expect(allowed.statusCode).toBe(200);
    await app.close();
  });
});
