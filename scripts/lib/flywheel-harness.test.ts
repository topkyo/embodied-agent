import { describe, expect, it } from "vitest";
import {
  assert,
  buildFlywheelReport,
  createScenarioRunner,
  parseFlywheelArgs,
} from "./flywheel-harness.js";

describe("parseFlywheelArgs", () => {
  it("defaults allowSkip to false", () => {
    expect(parseFlywheelArgs([])).toEqual({ allowSkip: false });
  });

  it("sets allowSkip when --allow-skip is present", () => {
    expect(parseFlywheelArgs(["--allow-skip"])).toEqual({ allowSkip: true });
  });

  it("throws on unknown args", () => {
    expect(() => parseFlywheelArgs(["--verbose"])).toThrow("未知参数: --verbose");
  });
});

describe("assert", () => {
  it("throws with message when condition is falsy", () => {
    expect(() => assert(false, "boom")).toThrow("boom");
  });

  it("does not throw when condition is truthy", () => {
    expect(() => assert(true, "boom")).not.toThrow();
  });
});

describe("createScenarioRunner", () => {
  it("collects pass and fail results", async () => {
    const { run, results } = createScenarioRunner();
    await run("ok case", async () => {});
    await run("bad case", async () => {
      throw new Error("nope");
    });
    expect(results).toEqual([
      { name: "ok case", ok: true },
      { name: "bad case", ok: false, detail: "nope" },
    ]);
  });
});

describe("buildFlywheelReport", () => {
  it("returns exitCode 0 when all scenarios pass", () => {
    const report = buildFlywheelReport([
      { name: "a", ok: true },
      { name: "b", ok: true },
    ]);
    expect(report.passed).toBe(2);
    expect(report.failed).toBe(0);
    expect(report.exitCode).toBe(0);
  });

  it("returns exitCode 1 when any scenario fails", () => {
    const report = buildFlywheelReport([
      { name: "a", ok: true },
      { name: "b", ok: false, detail: "x" },
    ]);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.exitCode).toBe(1);
  });
});
