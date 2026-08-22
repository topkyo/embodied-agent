import { getPlatformRuntimeContext } from "../runtime/context.js";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assessFlywheelReady } from "./flywheel-ready.js";
import { preloadDomainPacks } from "../domain-packs/loader.js";
import { registryConfigVersion } from "@embodied-agent/node";
import { saveSettings } from "../settings/store.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import {
  ingestHeartbeatMessage,
  resetTelemetryCacheForTests,
  upsertTelemetry,
} from "../telemetry/store.js";

let testDir: string;

describe("assessFlywheelReady", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    process.env.ACTIVE_DOMAIN = "agriculture";
    resetTelemetryCacheForTests();
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
        temperature_c: 26,
        humidity_percent: 90,
        vent_status: "closed",
        fan_status: "off",
      },
      {
        entity_id: "gh-002",
        temperature_c: 37,
        humidity_percent: 70,
        vent_status: "closed",
        fan_status: "off",
      },
    ]);
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("telemetry_ready false without ingested telemetry even if demo would seed", async () => {
    resetTelemetryCacheForTests();
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
    ingestHeartbeatMessage({ node_id: "node-sim-gh-002" });
    const status = await assessFlywheelReady();
    expect(status.telemetry_ready).toBe(false);
    expect(status.ready).toBe(false);
    expect(status.checks.find((check) => check.id === "flywheel_telemetry")?.ok).toBe(false);
  });

  it("requires fresh heartbeats for both sim nodes", async () => {
    expect((await assessFlywheelReady()).ready).toBe(false);
    ingestHeartbeatMessage({
      node_id: "node-sim-gh-001",
      config_version: registryConfigVersion("dep-gh-pilot-001", "node-sim-gh-001"),
    });
    expect((await assessFlywheelReady()).ready).toBe(false);
    ingestHeartbeatMessage({
      node_id: "node-sim-gh-002",
      config_version: registryConfigVersion("dep-gh-pilot-001", "node-sim-gh-002"),
    });
    const status = await assessFlywheelReady();
    expect(status.ready).toBe(true);
    expect(status.checks.find((check) => check.id === "greenhouse_sustained_alerts")?.ok).toBe(
      true,
    );
  });

  it("requires sim nodes to apply the registry config version", async () => {
    const gh002Cv = registryConfigVersion("dep-gh-pilot-001", "node-sim-gh-002") ?? 1;
    ingestHeartbeatMessage({
      node_id: "node-sim-gh-001",
      config_version: registryConfigVersion("dep-gh-pilot-001", "node-sim-gh-001"),
    });
    ingestHeartbeatMessage({
      node_id: "node-sim-gh-002",
      config_version: gh002Cv + 1,
    });
    const status = await assessFlywheelReady();
    expect(status.nodes_online).toBe(true);
    expect(status.config_ready).toBe(false);
    expect(status.ready).toBe(false);
    expect(status.nodes.find((node) => node.node_id === "node-sim-gh-002")?.config_ready).toBe(
      false,
    );
  });

  it("requires active pack to declare flywheel runtime readiness", async () => {
    saveSettings({
      deployment_id: "dep-gh-pilot-001",
      active_domain: "robotics",
      domain_configs: {
        robotics: {
          m20_base_url: "http://127.0.0.1:18080",
          default_robot_id: "m20-001",
        },
      },
    });
    await preloadDomainPacks(getPlatformRuntimeContext().loader, { packIds: ["robotics"] });
    await expect(assessFlywheelReady()).rejects.toThrow(
      /runtimeReadiness\.flywheel|resolveFlywheel/,
    );
  });
});
