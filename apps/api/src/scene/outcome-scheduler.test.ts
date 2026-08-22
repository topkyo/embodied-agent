import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyCommandEvent,
  createCommand,
  getCommand,
  markCommandSent,
} from "../commands/store.js";
import type { CommandMessage } from "@embodied-agent/core";
import { atomicWriteJson } from "@embodied-agent/platform";
import { deploymentScopedPath } from "../fs/deployment-path.js";
import { upsertTelemetry } from "../telemetry/store.js";
import { saveRegistry } from "@embodied-agent/node";
import { CANONICAL_SIM_REGISTRY } from "../test/registry-fixture.js";
import {
  clearOutcomeSchedulerForTest,
  enqueueOutcomeWindows,
  readOutcomeSchedulerPendingForTest,
  tickOutcomeScheduler,
} from "./outcome-scheduler.js";

function mockCommand(id = "cmd-sched-1"): CommandMessage {
  const now = new Date().toISOString();
  return {
    message_type: "command",
    protocol_version: "0.1",
    command_id: id,
    idempotency_key: `sched-${id}`,
    deployment_id: "dep-gh-pilot-001",
    node_id: "node-sim-gh-001",
    device_id: "vent-sim-gh-001",
    device_type: "vent_motor",
    action: "open",
    parameters: { duration_seconds: 600 },
    issued_by: {
      user_id: "owner-001",
      role: "owner",
      platform: "wechat",
      conversation_id: "wx-1",
    },
    created_at: now,
    expires_at: now,
  };
}

describe("outcome-scheduler", () => {
  beforeEach(() => {
    process.env.AGENT_DATA_DIR = mkdtempSync(join(tmpdir(), "outcome-sched-"));
    process.env.SCENE_OUTCOME_WINDOWS_MINUTES = "15";
    saveRegistry(CANONICAL_SIM_REGISTRY);
    upsertTelemetry([
      {
        entity_id: "gh-001",
        temperature_c: 30,
        humidity_percent: 70,
        vent_status: "open",
        fan_status: "off",
      },
    ]);
    clearOutcomeSchedulerForTest("dep-gh-pilot-001");
  });

  afterEach(() => {
    delete process.env.AGENT_DATA_DIR;
    delete process.env.SCENE_OUTCOME_WINDOWS_MINUTES;
  });

  it("enqueues window pending without duplicate", () => {
    enqueueOutcomeWindows("cmd-sched-1", "dep-gh-pilot-001", "gh-001");
    enqueueOutcomeWindows("cmd-sched-1", "dep-gh-pilot-001", "gh-001");
    expect(readOutcomeSchedulerPendingForTest("dep-gh-pilot-001")).toHaveLength(1);
  });

  it("retries when command not completed yet", () => {
    createCommand(mockCommand(), {
      scene_skill_id: "night_ventilation_control",
    });
    atomicWriteJson(deploymentScopedPath("scene-outcome-pending.json", "dep-gh-pilot-001"), [
      {
        command_id: "cmd-sched-1",
        deployment_id: "dep-gh-pilot-001",
        entity_id: "gh-001",
        window_minutes: 15,
        due_at: new Date(Date.now() - 1000).toISOString(),
        attempts: 0,
      },
    ]);

    tickOutcomeScheduler(["dep-gh-pilot-001"]);
    const pending = readOutcomeSchedulerPendingForTest("dep-gh-pilot-001");
    expect(pending).toHaveLength(1);
    expect(pending[0]?.attempts).toBe(1);
    expect(getCommand("cmd-sched-1", "dep-gh-pilot-001")?.status).toBe("created");
  });

  it("processes completed command and clears pending", () => {
    createCommand(mockCommand(), {
      scene_skill_id: "night_ventilation_control",
      telemetry_before: {
        entity_id: "gh-001",
        temperature_c: 32,
        humidity_percent: 80,
        vent_status: "closed",
        fan_status: "off",
        captured_at: new Date().toISOString(),
      },
    });
    markCommandSent("cmd-sched-1");
    applyCommandEvent({
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: "evt-sched-1",
      command_id: "cmd-sched-1",
      idempotency_key: "sched-cmd-sched-1",
      deployment_id: "dep-gh-pilot-001",
      node_id: "node-sim-gh-001",
      device_id: "vent-sim-gh-001",
      status: "completed",
      occurred_at: new Date().toISOString(),
    });
    atomicWriteJson(deploymentScopedPath("scene-outcome-pending.json", "dep-gh-pilot-001"), [
      {
        command_id: "cmd-sched-1",
        deployment_id: "dep-gh-pilot-001",
        entity_id: "gh-001",
        window_minutes: 15,
        due_at: new Date(Date.now() - 1000).toISOString(),
        attempts: 0,
      },
    ]);

    const n = tickOutcomeScheduler(["dep-gh-pilot-001"]);
    expect(n).toBe(1);
    expect(readOutcomeSchedulerPendingForTest("dep-gh-pilot-001")).toHaveLength(0);
  });
});
