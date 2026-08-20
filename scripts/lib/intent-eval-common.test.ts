import { describe, expect, it } from "vitest";
import { P0_SKILLS } from "@embodied-agent/core";
import {
  GOLDEN_EVAL_PATH,
  loadGoldenRows,
  loadMatrixSlices,
  matchesExpectation,
  MATRIX_EXTRA_PATH,
  MATRIX_NEGATIVE_PATH,
  MATRIX_WECHAT_PATH,
} from "./intent-eval-common.js";

describe("intent eval datasets", () => {
  it("golden + extra core matrix rows are non-empty", () => {
    const golden = loadGoldenRows(GOLDEN_EVAL_PATH);
    const extra = loadGoldenRows(MATRIX_EXTRA_PATH);
    expect(golden.length).toBeGreaterThan(0);
    expect(extra.length).toBeGreaterThan(0);
  });

  it("wechat regression slice is non-empty", () => {
    const wechat = loadGoldenRows(MATRIX_WECHAT_PATH);
    expect(wechat.length).toBeGreaterThanOrEqual(5);
  });

  it("negative regression slice is non-empty", () => {
    const negative = loadGoldenRows(MATRIX_NEGATIVE_PATH);
    expect(negative.length).toBeGreaterThanOrEqual(1);
  });

  it("loadMatrixSlices assigns ids across core, wechat, and negative", () => {
    const { core, wechat, negative, all } = loadMatrixSlices();
    expect(core.length).toBe(110);
    expect(wechat.length).toBeGreaterThan(0);
    expect(negative.length).toBeGreaterThan(0);
    expect(all.length).toBe(core.length + wechat.length + negative.length);
    expect(all[0]?.id).toBe(1);
    expect(all[all.length - 1]?.id).toBe(all.length);
  });

  it("matchesExpectation accepts core regression golden rows", () => {
    const golden = loadGoldenRows(GOLDEN_EVAL_PATH);
    const extra = loadGoldenRows(MATRIX_EXTRA_PATH);
    const reportWhat = golden.find((r) => r.utterance === "定时汇报是什么");
    const tempCap = extra.find((r) => r.utterance === "1号棚温度不超过28度");
    expect(reportWhat).toBeDefined();
    expect(tempCap).toBeDefined();

    expect(
      matchesExpectation(reportWhat!, {
        skill: "report.query_schedule",
        target: {},
      }),
    ).toBe(true);
    expect(
      matchesExpectation(tempCap!, {
        skill: "alert.set_threshold",
        target: { greenhouse_id: "gh-001" },
        parameters: {
          metric: "temperature_c",
          operator: "<=",
          value: 28,
        },
      }),
    ).toBe(true);
    expect(
      matchesExpectation(tempCap!, {
        skill: "alert.set_threshold",
        target: { greenhouse_id: "gh-001" },
        parameters: {
          metric: "temperature_c",
          operator: ">",
          value: 28,
        },
      }),
    ).toBe(false);
  });

  it("matrix covers every P0 skill", () => {
    const golden = loadGoldenRows(GOLDEN_EVAL_PATH);
    const extra = loadGoldenRows(MATRIX_EXTRA_PATH);
    const covered = new Set(
      [...golden, ...extra]
        .map((row) => row.expected_skill)
        .filter((skill) => skill !== "clarification_needed"),
    );
    for (const skill of P0_SKILLS) {
      expect(covered.has(skill), `missing matrix row for ${skill}`).toBe(true);
    }
  });
});
