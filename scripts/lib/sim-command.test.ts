import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIM_MAX_COMMAND_MS,
  STOP_SIM_MS,
  assertSimDurationReport,
  buildCompletedResult,
  elapsedSeconds,
  resolveCommandSleepMs,
  resolveSimMaxCommandMs,
} from "./sim-command.js";

describe("resolveSimMaxCommandMs", () => {
  it("returns 0 for realtime", () => {
    expect(resolveSimMaxCommandMs({ realtime: true })).toBe(0);
  });

  it("uses env when valid", () => {
    expect(resolveSimMaxCommandMs({ envValue: "3000" })).toBe(3000);
  });

  it("defaults to 0 (full user duration)", () => {
    expect(resolveSimMaxCommandMs({})).toBe(DEFAULT_SIM_MAX_COMMAND_MS);
  });
});

describe("resolveCommandSleepMs", () => {
  it("caps vent duration at SIM_MAX_COMMAND_MS", () => {
    expect(
      resolveCommandSleepMs({
        action: "open",
        durationSeconds: 900,
        maxCommandMs: 8000,
      }),
    ).toBe(8000);
  });

  it("uses full duration when maxCommandMs is 0 (realtime)", () => {
    expect(
      resolveCommandSleepMs({
        action: "open",
        durationSeconds: 900,
        maxCommandMs: 0,
      }),
    ).toBe(900_000);
  });

  it("uses fixed sleep for stop", () => {
    expect(
      resolveCommandSleepMs({
        action: "stop",
        durationSeconds: 900,
        maxCommandMs: 8000,
      }),
    ).toBe(STOP_SIM_MS);
  });

  it("rejects pulse actions without explicit duration", () => {
    expect(() =>
      resolveCommandSleepMs({
        action: "open",
        maxCommandMs: 8000,
      }),
    ).toThrow(/duration_seconds required/);
  });

  it("does not sleep for non-pulse actions without duration", () => {
    expect(
      resolveCommandSleepMs({
        action: "set_mode",
        maxCommandMs: 8000,
      }),
    ).toBe(0);
  });
});

describe("elapsedSeconds", () => {
  it("rounds to at least 1 second", () => {
    expect(elapsedSeconds(1000, 1400)).toBe(1);
    expect(elapsedSeconds(1000, 2500)).toBe(2);
  });
});

describe("buildCompletedResult", () => {
  it("reports actual duration for vent", () => {
    expect(buildCompletedResult("open", 8)).toEqual({
      reason: "duration_elapsed",
      actual_duration_seconds: 8,
    });
  });

  it("does not echo planned duration when capped", () => {
    const planned = 900;
    const sleepMs = resolveCommandSleepMs({
      action: "open",
      durationSeconds: planned,
      maxCommandMs: 8000,
    });
    const actual = elapsedSeconds(0, sleepMs);
    const result = buildCompletedResult("open", actual);
    expect(result.actual_duration_seconds).toBe(8);
    expect(result.actual_duration_seconds).not.toBe(planned);
    expect(() =>
      assertSimDurationReport(planned, result.actual_duration_seconds, 8000),
    ).not.toThrow();
  });

  it("fails assertion when actual equals planned under cap", () => {
    expect(() => assertSimDurationReport(900, 900, 8000)).toThrow(/不应等于计划/);
  });
});
