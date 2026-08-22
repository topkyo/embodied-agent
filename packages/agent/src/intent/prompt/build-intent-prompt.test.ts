import { describe, expect, it } from "vitest";
import { GREENHOUSE_INTENT_CONTRACT } from "@embodied-agent/domain-agriculture";
import { buildIntentPrompt } from "./build-intent-prompt.js";
import type { DeploymentContext } from "./types.js";
import { bindTestAgentRuntime } from "../../../test/bind-test-runtime.js";

const bindings = bindTestAgentRuntime();
const ctx: DeploymentContext = {
  scene_context_sections: ["温室 ID 对照：\n- gh-001: 1号棚、一号棚\n- gh-002: 2号棚、二号棚"],
};

describe("buildIntentPrompt", () => {
  const buildGreenhousePrompt = () =>
    buildIntentPrompt(bindings, {
      ctx,
      mode: "resolve",
      intentContract: GREENHOUSE_INTENT_CONTRACT,
    });

  it("assembles resolve-mode prompt with schema, rules, and examples", () => {
    const prompt = buildGreenhousePrompt();
    expect(prompt).toContain("守棚工长");
    expect(prompt).toContain("gh-001");
    expect(prompt).toContain("契约摘要");
    expect(prompt).toContain("clarification_needed");
  });

  it("keeps open_vent mapping for 最长通风改成", () => {
    const prompt = buildGreenhousePrompt();
    expect(prompt).toContain("最长通风改成");
  });

  it("keeps alert operator semantics for 不超过", () => {
    const prompt = buildGreenhousePrompt();
    expect(prompt).toContain('不超过/别超过/低于 N 度 → operator "<="');
    expect(prompt).toContain('"operator":"<="');
  });

  it("keeps report.query_schedule for 定时汇报是什么", () => {
    const prompt = buildGreenhousePrompt();
    expect(prompt).toContain("定时汇报是什么");
    expect(prompt).toContain("report.query_schedule");
    expect(prompt).toContain("勿 clarification_needed");
    expect(prompt).toContain('{"skill":"report.query_schedule","target":{},"confidence":0.9}');
  });

  it("returns minimal repair preamble for non-resolve modes", () => {
    const repair = buildIntentPrompt(bindings, { ctx, mode: "repair-json" });
    expect(repair).not.toContain("契约摘要");
    expect(repair).toContain("只输出一行 JSON");
  });
});
