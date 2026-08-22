import { afterEach, describe, expect, it } from "vitest";
import {
  applySimCommandActuators,
  clearSimTelemetryForTests,
  createRhythm,
  industrialSimTelemetryBounds,
  initSimTelemetry,
  readIndustrialSimTelemetry,
  readSimActuators,
  parseRhythmArg,
  readSimTelemetry,
  releaseSimCommandActuators,
  resetSimTelemetryBaseline,
  resolveRhythmCliValue,
  resolveSimScenario,
  setSimFanActive,
  setSimVentActive,
  tickIndustrialSimTelemetry,
  tickSimTelemetry,
} from "./sim-telemetry.js";

describe("sim-telemetry", () => {
  afterEach(() => {
    clearSimTelemetryForTests();
    delete process.env.SIM_TELEMETRY_SCENARIO;
    delete process.env.SIM_TELEMETRY_REACT;
    delete process.env.GREENHOUSE_ID;
  });

  it("full scenario maps gh-001 high humidity and gh-002 emergency heat", () => {
    expect(resolveSimScenario("node-sim-gh-001", "full")).toBe("high_humidity");
    expect(resolveSimScenario("node-sim-gh-002", "full")).toBe("emergency_heat");
  });

  it("react cools when vent active under high_temp", () => {
    process.env.SIM_TELEMETRY_SCENARIO = "high_temp";
    process.env.SIM_TELEMETRY_REACT = "1";
    initSimTelemetry("node-sim-gh-002", "high_temp");
    const before = readSimTelemetry("node-sim-gh-002").temperature_c;
    setSimVentActive("node-sim-gh-002", true);
    const after = tickSimTelemetry("node-sim-gh-002").temperature_c;
    expect(after).toBeLessThan(before);
  });

  it("react cools when fan active under high_temp", () => {
    process.env.SIM_TELEMETRY_SCENARIO = "high_temp";
    process.env.SIM_TELEMETRY_REACT = "1";
    initSimTelemetry("node-sim-gh-002", "high_temp");
    const before = readSimTelemetry("node-sim-gh-002").temperature_c;
    setSimFanActive("node-sim-gh-002", true);
    const after = tickSimTelemetry("node-sim-gh-002").temperature_c;
    expect(after).toBeLessThan(before);
  });

  it("industrial baseline fluctuates within 45-55C", () => {
    initSimTelemetry("node-sim-industrial-001", undefined, undefined, "industrial");
    for (let i = 0; i < 30; i += 1) {
      const { temperature_c } = tickIndustrialSimTelemetry("node-sim-industrial-001");
      expect(temperature_c).toBeGreaterThanOrEqual(industrialSimTelemetryBounds.baselineMinC);
      expect(temperature_c).toBeLessThanOrEqual(industrialSimTelemetryBounds.baselineMaxC);
    }
  });

  it("industrial overheat drifts above threshold", () => {
    process.env.SIM_TELEMETRY_SCENARIO = "overheat";
    initSimTelemetry("node-sim-industrial-001", "overheat", undefined, "industrial");
    const after = tickIndustrialSimTelemetry("node-sim-industrial-001").temperature_c;
    expect(after).toBeGreaterThan(industrialSimTelemetryBounds.overheatThresholdC);
  });

  it("industrial overheat cools when exhaust fan active", () => {
    process.env.SIM_TELEMETRY_SCENARIO = "overheat";
    process.env.SIM_TELEMETRY_REACT = "1";
    initSimTelemetry("node-sim-industrial-001", "overheat", undefined, "industrial");
    const before = readIndustrialSimTelemetry("node-sim-industrial-001").temperature_c;
    setSimFanActive("node-sim-industrial-001", true);
    const after = tickIndustrialSimTelemetry("node-sim-industrial-001").temperature_c;
    expect(after).toBeLessThan(before);
  });

  it("industrial exhaust fan command cools overheat via command actuator mapping", () => {
    process.env.SIM_TELEMETRY_SCENARIO = "overheat";
    process.env.SIM_TELEMETRY_REACT = "1";
    initSimTelemetry("node-sim-industrial-001", "overheat", undefined, "industrial");
    const before = readIndustrialSimTelemetry("node-sim-industrial-001").temperature_c;

    // 走 handleCommand 的指令→执行器真源映射，而非直接拨 setSimFanActive
    const fanStart = { device_type: "fan", action: "start" };
    applySimCommandActuators("node-sim-industrial-001", fanStart);
    expect(readSimActuators("node-sim-industrial-001").fan).toBe(true);

    const during = tickIndustrialSimTelemetry("node-sim-industrial-001").temperature_c;
    expect(during).toBeLessThan(before);

    releaseSimCommandActuators("node-sim-industrial-001", fanStart);
    expect(readSimActuators("node-sim-industrial-001").fan).toBe(false);
  });

  it("industrial command mapping ignores greenhouse-only devices", () => {
    initSimTelemetry("node-sim-industrial-001", undefined, undefined, "industrial");
    applySimCommandActuators("node-sim-industrial-001", {
      device_type: "vent_motor",
      action: "open",
    });
    applySimCommandActuators("node-sim-industrial-001", {
      device_type: "irrigation_valve",
      action: "start",
    });
    const actuators = readSimActuators("node-sim-industrial-001");
    expect(actuators.vent).toBe(false);
    expect(actuators.irrigation).toBe(false);
  });

  it("rhythm transitions stable → excursion → resolved → stable → excursion", () => {
    process.env.SIM_TELEMETRY_REACT = "1";
    initSimTelemetry("node-rhythm-gh", undefined, "gh-001", "greenhouse");

    let currentTime = 0;
    const randomValues = [0, 0];
    let randomIndex = 0;
    const minIntervalMs = 1_000;
    const maxIntervalMs = 2_000;

    const rhythm = createRhythm({
      minIntervalMs,
      maxIntervalMs,
      scenario: "high_temp",
      now: () => currentTime,
      random: () => randomValues[randomIndex++] ?? 0,
    });

    rhythm.tick("node-rhythm-gh");
    expect(rhythm.getPhase()).toBe("stable");
    expect(rhythm.getActiveScenario()).toBeUndefined();

    currentTime = minIntervalMs;
    rhythm.tick("node-rhythm-gh");
    expect(rhythm.getPhase()).toBe("excursion");
    expect(rhythm.getActiveScenario()).toBe("high_temp");
    expect(readSimTelemetry("node-rhythm-gh").temperature_c).toBeGreaterThan(30);

    for (let i = 0; i < 20 && rhythm.getPhase() === "excursion"; i += 1) {
      setSimFanActive("node-rhythm-gh", true);
      tickSimTelemetry("node-rhythm-gh");
      rhythm.tick("node-rhythm-gh");
    }

    expect(rhythm.getPhase()).toBe("stable");
    expect(rhythm.getActiveScenario()).toBeUndefined();
    expect(readSimTelemetry("node-rhythm-gh").temperature_c).toBeLessThanOrEqual(30);

    currentTime = minIntervalMs + minIntervalMs;
    rhythm.tick("node-rhythm-gh");
    expect(rhythm.getPhase()).toBe("excursion");
    expect(rhythm.getActiveScenario()).toBe("high_temp");
  });

  it("rhythm schedules excursions within [min,max] interval", () => {
    initSimTelemetry("node-rhythm-interval", undefined, "gh-001", "greenhouse");

    let currentTime = 0;
    const minIntervalMs = 1_000;
    const maxIntervalMs = 3_000;
    const randomValues = [0, 1, 0.5];
    let randomIndex = 0;

    const rhythm = createRhythm({
      minIntervalMs,
      maxIntervalMs,
      scenario: "high_temp",
      now: () => currentTime,
      random: () => randomValues[randomIndex++] ?? 0,
    });

    const firstAt = rhythm.getNextExcursionAt();
    expect(firstAt).toBe(minIntervalMs);
    expect(firstAt! - currentTime).toBeGreaterThanOrEqual(minIntervalMs);
    expect(firstAt! - currentTime).toBeLessThanOrEqual(maxIntervalMs);

    currentTime = firstAt!;
    rhythm.tick("node-rhythm-interval");
    expect(rhythm.getPhase()).toBe("excursion");

    resetSimTelemetryBaseline("node-rhythm-interval");
    rhythm.tick("node-rhythm-interval");
    expect(rhythm.getPhase()).toBe("stable");

    const secondAt = rhythm.getNextExcursionAt();
    expect(secondAt).not.toBeNull();
    const gap = secondAt! - currentTime;
    expect(gap).toBeGreaterThanOrEqual(minIntervalMs);
    expect(gap).toBeLessThanOrEqual(maxIntervalMs);
    expect(gap).toBe(minIntervalMs + Math.floor(1 * (maxIntervalMs - minIntervalMs)));
  });

  it("rhythm daily reset clears drift baseline without changing phase", () => {
    initSimTelemetry("node-rhythm-day", "overheat", undefined, "industrial");
    expect(readIndustrialSimTelemetry("node-rhythm-day").temperature_c).toBe(56.5);

    const dayOneLate = new Date(2026, 6, 4, 23, 30, 0, 0).getTime();
    const dayTwoEarly = new Date(2026, 6, 5, 0, 15, 0, 0).getTime();
    let currentTime = dayOneLate;

    const rhythm = createRhythm({
      minIntervalMs: 3_600_000,
      maxIntervalMs: 7_200_000,
      scenario: "overheat",
      now: () => currentTime,
      random: () => 0,
    });

    rhythm.tick("node-rhythm-day");
    expect(rhythm.getPhase()).toBe("stable");

    currentTime = dayTwoEarly;
    rhythm.tick("node-rhythm-day");
    expect(rhythm.getPhase()).toBe("stable");
    expect(readIndustrialSimTelemetry("node-rhythm-day").temperature_c).toBe(50);
  });

  it("rhythm daily reset during excursion defers until back to stable", () => {
    process.env.SIM_TELEMETRY_REACT = "1";
    initSimTelemetry("node-rhythm-cross", undefined, undefined, "industrial");

    const dayOneLate = new Date(2026, 6, 4, 23, 50, 0, 0).getTime();
    const dayTwoEarly = new Date(2026, 6, 5, 0, 10, 0, 0).getTime();
    const minIntervalMs = 60_000;
    let currentTime = dayOneLate;

    const rhythm = createRhythm({
      minIntervalMs,
      maxIntervalMs: 120_000,
      scenario: "overheat",
      now: () => currentTime,
      random: () => 0,
    });

    // 23:51 到点进入越界
    currentTime = dayOneLate + minIntervalMs;
    rhythm.tick("node-rhythm-cross");
    expect(rhythm.getPhase()).toBe("excursion");
    const excursionTemp = readIndustrialSimTelemetry("node-rhythm-cross").temperature_c;
    expect(excursionTemp).toBeGreaterThan(industrialSimTelemetryBounds.overheatThresholdC);

    // 跨过本地 0 点：场景不被打断，温度不被复位
    currentTime = dayTwoEarly;
    rhythm.tick("node-rhythm-cross");
    expect(rhythm.getPhase()).toBe("excursion");
    expect(rhythm.getActiveScenario()).toBe("overheat");
    expect(readIndustrialSimTelemetry("node-rhythm-cross").temperature_c).toBe(excursionTemp);

    // 排风降温直到回稳，回稳时基线才复位
    for (let i = 0; i < 50 && rhythm.getPhase() === "excursion"; i += 1) {
      setSimFanActive("node-rhythm-cross", true);
      tickIndustrialSimTelemetry("node-rhythm-cross");
      rhythm.tick("node-rhythm-cross");
    }
    expect(rhythm.getPhase()).toBe("stable");
    expect(readIndustrialSimTelemetry("node-rhythm-cross").temperature_c).toBe(50);
  });

  it("parseRhythmArg accepts valid range and rejects invalid formats", () => {
    expect(parseRhythmArg("30-60m")).toEqual({
      minIntervalMs: 30 * 60_000,
      maxIntervalMs: 60 * 60_000,
    });
    expect(() => parseRhythmArg("60-30m")).toThrow(/min <= max/);
    expect(() => parseRhythmArg("0-10m")).toThrow(/positive/);
    expect(() => parseRhythmArg("abc")).toThrow(/expected <min>-<max>m/);
    expect(() => parseRhythmArg("")).toThrow(/expected <min>-<max>m/);
  });

  it("resolveRhythmCliValue rejects bare flag and empty value", () => {
    expect(resolveRhythmCliValue(undefined)).toBeUndefined();
    expect(resolveRhythmCliValue("30-60m")).toEqual({
      minIntervalMs: 30 * 60_000,
      maxIntervalMs: 60 * 60_000,
    });
    expect(() => resolveRhythmCliValue(true)).toThrow(/--rhythm requires a value/);
    expect(() => resolveRhythmCliValue("")).toThrow(/--rhythm requires a value/);
  });
});
