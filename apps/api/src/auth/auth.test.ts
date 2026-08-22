import { getPlatformRuntimeContext } from "../runtime/context.js";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { afterEach, describe, expect, it, beforeAll, beforeEach } from "vitest";
import { routeIntent } from "../skills/router.js";
import { clearOperationLogs } from "../db/log.js";
import { saveSettings } from "../settings/store.js";

import type { CommandMessage, IntentPayload } from "@embodied-agent/core";
import { canRoleExecuteSkill, WORKER_ALLOWED_SKILLS } from "./roles.js";
import { MqttCommandPublisher } from "@embodied-agent/node";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import { recordNodeAppliedConfigVersion } from "@embodied-agent/node";
import { issueNodeToken } from "@embodied-agent/node";
import { ingestHeartbeatMessage } from "../telemetry/store.js";
import { preloadDomainPacks } from "../domain-packs/loader.js";

let testDir: string;

class RecordingMqttPublisher extends MqttCommandPublisher {
  constructor() {
    super("mqtt://127.0.0.1:1883");
  }

  override async connect(): Promise<void> {}

  override async publishCommand(_cmd: CommandMessage): Promise<void> {}

  override async publishNodeConfig(): Promise<void> {}
}

const openIntent: IntentPayload = {
  skill: "greenhouse.open_vent",
  target: { greenhouse_id: "gh-001" },
  parameters: { duration_seconds: 300 },
};

describe("auth roles", () => {
  beforeAll(async () => {
    await preloadDomainPacks(getPlatformRuntimeContext().loader, { packIds: ["robotics"] });
  });

  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    seedCanonicalSimRegistry();
    recordNodeAppliedConfigVersion("dep-gh-pilot-001", "node-sim-gh-001", 1, "config_applied");
    issueNodeToken("dep-gh-pilot-001", "node-sim-gh-001");
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001", config_version: 1 });
    clearOperationLogs();
    saveSettings({ deployment_id: "dep-gh-pilot-001", active_domain: "agriculture" });
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("worker cannot open_vent per role matrix", () => {
    expect(canRoleExecuteSkill("worker", "greenhouse.open_vent")).toBe(false);
    expect(WORKER_ALLOWED_SKILLS.has("fan.start")).toBe(true);
  });

  it("uses active robotics role matrix when robotics domain is enabled", () => {
    process.env.ACTIVE_DOMAIN = "robotics";
    saveSettings({ deployment_id: "dep-gh-pilot-001", active_domain: "robotics" });
    expect(canRoleExecuteSkill("readonly", "robot.query_status")).toBe(true);
    expect(canRoleExecuteSkill("readonly", "robot.move")).toBe(false);
    expect(canRoleExecuteSkill("worker", "robot.query_pose")).toBe(true);
    expect(canRoleExecuteSkill("worker", "fan.start")).toBe(false);
  });

  it("owner passes safety for open_vent", async () => {
    const { status } = await routeIntent(openIntent, {
      user_id: "owner-001",
      role: "owner",
      model: "mock",
      conversation_id: "conv-auth-owner",
      mqtt: new RecordingMqttPublisher(),
    });
    expect(status).toBe(200);
  });

  it("worker rejected for same open_vent intent with Chinese reason", async () => {
    const { status, reply } = await routeIntent(openIntent, {
      user_id: "worker-001",
      role: "worker",
      model: "mock",
    });
    expect(status).toBe(403);
    expect(reply).toContain("工人");
  });

  it("readonly rejected for control skills", async () => {
    const { status, reply } = await routeIntent(openIntent, {
      user_id: "readonly-001",
      role: "readonly",
      model: "mock",
    });
    expect(status).toBe(403);
    expect(reply).toMatch(/查看|控制/);
  });
});
