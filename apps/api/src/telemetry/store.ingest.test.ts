import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import { getTelemetry, ingestTelemetryMessage, resetTelemetryCacheForTests } from "./store.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

let testDir: string;

describe("ingestTelemetryMessage readings", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    seedCanonicalSimRegistry();
    resetTelemetryCacheForTests();
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("does not seed demo telemetry on read", () => {
    expect(getTelemetry("gh-001")).toBeUndefined();
  });

  it("stores relay_state as generic device readings without deriving actuator status", () => {
    const ok = ingestTelemetryMessage({
      readings: [
        { device_id: "sensor-sim-gh-001", metric: "temperature_c", value: 28.5 },
        { device_id: "sensor-sim-gh-001", metric: "humidity_percent", value: 72 },
        { device_id: "vent-sim-gh-001", metric: "relay_state", value: 0 },
        { device_id: "fan-sim-gh-001", metric: "relay_state", value: 0 },
      ],
    });
    expect(ok).toBe(true);
    const tel = getTelemetry("gh-001");
    expect(tel?.temperature_c).toBe(28.5);
    expect(tel?.humidity_percent).toBe(72);
    expect(tel?.vent_status).toBeUndefined();
    expect(tel?.fan_status).toBeUndefined();
    expect(tel?.device_readings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          device_id: "vent-sim-gh-001",
          device_type: "vent_motor",
          metric: "relay_state",
          value: 0,
        }),
        expect.objectContaining({
          device_id: "fan-sim-gh-001",
          device_type: "fan",
          metric: "relay_state",
          value: 0,
        }),
      ]),
    );
  });

  it("keeps relay_state numeric when actuator readings are 1", () => {
    ingestTelemetryMessage({
      readings: [
        { device_id: "sensor-sim-gh-002", metric: "temperature_c", value: 35 },
        { device_id: "sensor-sim-gh-002", metric: "humidity_percent", value: 68 },
        { device_id: "vent-sim-gh-002", metric: "relay_state", value: 1 },
        { device_id: "fan-sim-gh-002", metric: "relay_state", value: 1 },
      ],
    });
    const tel = getTelemetry("gh-002");
    expect(tel?.vent_status).toBeUndefined();
    expect(tel?.fan_status).toBeUndefined();
    expect(tel?.device_readings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          device_id: "vent-sim-gh-002",
          device_type: "vent_motor",
          metric: "relay_state",
          value: 1,
        }),
        expect.objectContaining({
          device_id: "fan-sim-gh-002",
          device_type: "fan",
          metric: "relay_state",
          value: 1,
        }),
      ]),
    );
  });

  it("preserves prior numeric metrics when later readings are partial", () => {
    ingestTelemetryMessage({
      readings: [
        { device_id: "sensor-sim-gh-001", metric: "temperature_c", value: 27 },
        { device_id: "sensor-sim-gh-001", metric: "humidity_percent", value: 70 },
        { device_id: "vent-sim-gh-001", metric: "relay_state", value: 1 },
        { device_id: "fan-sim-gh-001", metric: "relay_state", value: 0 },
      ],
    });
    ingestTelemetryMessage({
      readings: [
        { device_id: "sensor-sim-gh-001", metric: "temperature_c", value: 26.5 },
        { device_id: "sensor-sim-gh-001", metric: "humidity_percent", value: 69 },
      ],
    });
    const tel = getTelemetry("gh-001");
    expect(tel?.temperature_c).toBe(26.5);
    expect(tel?.humidity_percent).toBe(69);
    expect(tel?.device_readings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          device_id: "vent-sim-gh-001",
          device_type: "vent_motor",
          metric: "relay_state",
          value: 1,
        }),
        expect.objectContaining({
          device_id: "fan-sim-gh-001",
          device_type: "fan",
          metric: "relay_state",
          value: 0,
        }),
      ]),
    );
  });

  it("creates entity telemetry from partial metric readings", () => {
    const ok = ingestTelemetryMessage({
      readings: [{ device_id: "sensor-sim-gh-001", metric: "temperature_c", value: 26.5 }],
    });
    expect(ok).toBe(true);
    expect(getTelemetry("gh-001")?.temperature_c).toBe(26.5);
  });

  it("does not invent actuator status when no actuator readings exist", () => {
    const ok = ingestTelemetryMessage({
      readings: [
        { device_id: "sensor-sim-gh-001", metric: "temperature_c", value: 26.5 },
        { device_id: "sensor-sim-gh-001", metric: "humidity_percent", value: 69 },
      ],
    });
    expect(ok).toBe(true);
    const tel = getTelemetry("gh-001");
    expect(tel?.vent_status).toBeUndefined();
    expect(tel?.fan_status).toBeUndefined();
  });

  it("fails visibly on corrupt persisted telemetry state", () => {
    const deploymentDir = resolve(testDir, "deployments", "dep-gh-pilot-001");
    mkdirSync(deploymentDir, { recursive: true });
    writeFileSync(resolve(deploymentDir, "telemetry-state.json"), "{not-json", "utf8");
    expect(() => getTelemetry("gh-001")).toThrow(/telemetry-state\.json.*无法读取或校验失败/);
  });
});
