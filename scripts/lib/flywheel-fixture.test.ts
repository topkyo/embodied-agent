import { allocateAgentDataDir, releaseAgentDataDir } from "@embodied-agent/platform";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, beforeEach } from "vitest";
import { resetFlywheelRunState } from "./flywheel-fixture.js";

let testDir: string;

describe("resetFlywheelRunState", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("flywheel-fixture");
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("strips sim node heartbeats and gh telemetry from telemetry-state", () => {
    const farmDir = resolve(testDir, "deployments", "dep-gh-pilot-001");
    mkdirSync(farmDir, { recursive: true });
    writeFileSync(
      resolve(farmDir, "telemetry-state.json"),
      `${JSON.stringify(
        {
          deviceReadings: [],
          cache: [
            {
              entity_id: "gh-001",
              temperature_c: 31,
              humidity_percent: 88,
              vent_status: "closed",
              fan_status: "off",
              reported_at: "2026-06-09T00:00:00.000Z",
            },
            {
              entity_id: "gh-002",
              temperature_c: 36,
              humidity_percent: 55,
              vent_status: "closed",
              fan_status: "off",
              reported_at: "2026-06-09T00:00:00.000Z",
            },
          ],
          heartbeats: [
            {
              node_id: "node-sim-gh-001",
              reported_at: "2026-06-09T00:00:00.000Z",
            },
            {
              node_id: "node-sim-gh-002",
              reported_at: "2026-06-09T00:00:00.000Z",
            },
            { node_id: "node-real-001", reported_at: "2026-06-09T00:00:00.000Z" },
          ],
        },
        null,
        2,
      )}\n`,
    );

    resetFlywheelRunState(testDir);

    const state = JSON.parse(readFileSync(resolve(farmDir, "telemetry-state.json"), "utf8")) as {
      cache: { entity_id: string }[];
      heartbeats: { node_id: string }[];
    };
    expect(state.cache).toHaveLength(0);
    expect(state.heartbeats.map((h) => h.node_id)).toEqual(["node-real-001"]);
  });

  it("clears pending-confirm and alert rules for a clean flywheel run", () => {
    mkdirSync(resolve(testDir, "deployments", "dep-gh-pilot-001"), { recursive: true });
    writeFileSync(resolve(testDir, "pending-confirm.json"), '[{"user_id":"owner-001"}]\n');
    writeFileSync(
      resolve(testDir, "deployments", "dep-gh-pilot-001", "alert-rules.json"),
      '{"rules":[{"entity_id":"gh-001","metric":"humidity_percent"}]}\n',
    );

    resetFlywheelRunState(testDir);

    expect(JSON.parse(readFileSync(resolve(testDir, "pending-confirm.json"), "utf8"))).toEqual([]);
    expect(
      JSON.parse(
        readFileSync(
          resolve(testDir, "deployments", "dep-gh-pilot-001", "alert-rules.json"),
          "utf8",
        ),
      ),
    ).toEqual({ rules: [] });
  });
});
