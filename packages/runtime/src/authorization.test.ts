import { describe, expect, it } from "vitest";
import { activeDomainAuthorizationPolicy, activeDomainSafetyPolicy } from "./authorization.js";
import { makeRuntimeTestContext, makeTestContract, makeTestCore } from "./test-runtime-context.js";

describe("authorization", () => {
  it("returns active domain safety policy when declared", () => {
    const ctx = makeRuntimeTestContext();
    const safety = activeDomainSafetyPolicy(ctx);
    expect(safety.authorization.controlSkills).toEqual(["device.control"]);
    expect(safety.confirmDurationThresholdSeconds).toBe(600);
  });

  it("returns authorization policy from safety", () => {
    const ctx = makeRuntimeTestContext();
    expect(activeDomainAuthorizationPolicy(ctx)).toEqual({
      controlSkills: ["device.control"],
      workerAllowedSkills: ["device.query"],
      readonlyAllowedSkills: ["device.query"],
    });
  });

  it("fails visibly when safety policy is missing", () => {
    const core = makeTestCore({ safety: undefined });
    const ctx = makeRuntimeTestContext({ contract: makeTestContract(core) });
    expect(() => activeDomainSafetyPolicy(ctx)).toThrow(/未声明 safety policy/);
  });
});
