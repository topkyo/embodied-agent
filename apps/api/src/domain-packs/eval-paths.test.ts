import { describe, expect, it } from "vitest";
import { resolveActiveEvalConfig } from "@embodied-agent/runtime";
import { resolveActiveDomainPackContracts } from "./loader.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";

describe("domain-packs eval-paths", () => {
  const holder = () => getPlatformRuntimeContext().loader;

  it("aligns eval paths with resolveActiveDomainPackContracts", () => {
    const settings = { active_domain: "agriculture" };
    const [contract] = resolveActiveDomainPackContracts(holder(), settings);
    const evalConfig = resolveActiveEvalConfig(holder(), settings);
    expect(evalConfig.packIds).toEqual(["agriculture"]);
    expect(evalConfig.goldenPaths[0]).toBe(contract?.core.eval.golden);
    expect(evalConfig.matrixExtraPaths[0]).toBe(contract?.core.eval.matrixExtra);
    expect(evalConfig.matrixWechatPaths[0]).toBe(contract?.core.eval.matrixWechat);
    expect(evalConfig.matrixNegativePaths[0]).toBe(contract?.core.eval.matrixNegative);
    expect(evalConfig.goldenPaths[0]).toContain("intent-golden.zh.jsonl");
    expect(evalConfig.matrixNegativePaths[0]).toContain("sim-matrix-negative.jsonl");
  });

  it("throws when active_domain is empty", () => {
    expect(() => resolveActiveEvalConfig(holder(), { active_domain: "" })).toThrow(/active_domain/);
  });
});
