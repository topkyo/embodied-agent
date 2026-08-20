import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { buildAdminOverview, telemetryStaleMs } from "./admin-overview.js";
import { buildApp } from "../app.js";
import { createMqttContext } from "@embodied-agent/node";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import {
  ingestHeartbeatMessage,
  resetTelemetryCacheForTests,
  upsertTelemetry,
} from "../telemetry/store.js";
import { clearAllPendingConfirm, setPendingConfirm } from "../policy/pending-confirm.js";
import type { IntentPayload } from "@embodied-agent/core";

let testDir: string;
const mqttCtx = createMqttContext();

const intent: IntentPayload = {
  skill: "greenhouse.open_vent",
  target: { greenhouse_id: "gh-001" },
  parameters: { duration_seconds: 600 },
};

describe("buildAdminOverview", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    seedCanonicalSimRegistry();
    resetTelemetryCacheForTests();
    clearAllPendingConfirm();
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
    delete process.env.DEVICE_HEARTBEAT_TIMEOUT_MS;
    delete process.env.TELEMETRY_STALE_MS;
    releaseAgentDataDir(testDir);
  });

  it("returns active-domain registry entities with stale when no telemetry", () => {
    const overview = buildAdminOverview(mqttCtx);
    expect(overview.entities.length).toBeGreaterThan(0);
    expect(overview.entities.every((entity) => entity.stale)).toBe(true);
    expect(overview.pending_confirms_count).toBe(0);
    expect(overview.pending_confirms).toEqual([]);
  });

  it("telemetryStaleMs reads TELEMETRY_STALE_MS env", () => {
    process.env.TELEMETRY_STALE_MS = "120000";
    expect(telemetryStaleMs()).toBe(120_000);
  });

  it("telemetryStaleMs falls back when env is invalid", () => {
    process.env.TELEMETRY_STALE_MS = "nope";
    expect(telemetryStaleMs()).toBe(90_000);
  });

  it("marks telemetry stale after TELEMETRY_STALE_MS elapsed", () => {
    process.env.TELEMETRY_STALE_MS = "30000";
    upsertTelemetry([
      {
        entity_id: "gh-001",
        temperature_c: 26,
        humidity_percent: 72,
        vent_status: "closed",
        fan_status: "off",
      },
    ]);
    const overview = buildAdminOverview(mqttCtx, Date.now() + 31_000);
    const gh001 = overview.entities.find((entity) => entity.entity_id === "gh-001");
    expect(gh001?.stale).toBe(true);
  });

  it("marks entity fresh when telemetry is recent", () => {
    upsertTelemetry([
      {
        entity_id: "gh-001",
        temperature_c: 26,
        humidity_percent: 72,
        vent_status: "closed",
        fan_status: "off",
      },
    ]);
    const overview = buildAdminOverview(mqttCtx);
    const gh001 = overview.entities.find((entity) => entity.entity_id === "gh-001");
    expect(gh001?.stale).toBe(false);
    expect(gh001?.telemetry?.temperature_c).toBe(26);
    expect("temperature_c" in (gh001 ?? {})).toBe(false);
  });

  it("filters nodes to active deployment_id", () => {
    const overview = buildAdminOverview(mqttCtx);
    expect(overview.nodes.every((n) => n.deployment_id === overview.deployment_id)).toBe(true);
  });

  it("counts pending confirms and reports node online state", () => {
    setPendingConfirm({
      intent,
      user_id: "owner-001",
      conversation_id: "conv-1",
      model: "mock",
    });
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
    const overview = buildAdminOverview(mqttCtx);
    expect(overview.pending_confirms_count).toBe(1);
    expect(overview.pending_confirms).toHaveLength(1);
    expect(overview.pending_confirms[0]).toMatchObject({
      user_id: "owner-001",
      action_summary: "greenhouse.open_vent",
      target_summary: "gh-001",
    });
    expect(overview.pending_confirms[0]).not.toHaveProperty("intent");
    expect(JSON.stringify(overview.pending_confirms)).not.toContain("parameters");
    const node = overview.nodes.find((n) => n.node_id === "node-sim-gh-001");
    expect(node?.online).toBe(true);
    expect(overview.services.api).toBe("ok");
  });

  it("GET /admin/overview returns pending_confirms without full intent blob", async () => {
    process.env.ADMIN_TOKEN = "test-admin-token";
    setPendingConfirm({
      intent,
      user_id: "owner-001",
      conversation_id: "conv-1",
      model: "mock",
      scene_skill_id: "humidity_mildew_prevention",
    });
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/admin/overview",
      headers: { "x-admin-token": "test-admin-token" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      pending_confirms: Array<{
        user_id: string;
        action_summary: string;
        target_summary: string;
        scene_skill_id?: string;
        intent?: unknown;
      }>;
    };
    expect(body.pending_confirms).toHaveLength(1);
    expect(body.pending_confirms[0]).toMatchObject({
      user_id: "owner-001",
      action_summary: "greenhouse.open_vent",
      target_summary: "gh-001",
      scene_skill_id: "humidity_mildew_prevention",
    });
    expect(body.pending_confirms[0]).not.toHaveProperty("intent");
    expect(JSON.stringify(body.pending_confirms)).not.toContain("parameters");
    await app.close();
  });
});
