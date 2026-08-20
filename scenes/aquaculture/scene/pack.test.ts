import { describe, expect, it } from "vitest";
import { assertDomainPackConformance } from "@embodied-agent/domain-sdk";
import { createDomainPackContract } from "./pack.js";

describe("aquaculture domain pack", () => {
  it("passes domain-sdk conformance gate", () => {
    assertDomainPackConformance(createDomainPackContract());
  });

  it("is a placeholder pack with structural contracts only", () => {
    const contract = createDomainPackContract();
    expect(contract.core.manifest.status).toBe("placeholder");
    expect(contract.core.skills.p0).toEqual([]);
    expect(contract.core.intentSchemas).toEqual([]);
    expect(contract.core.targetResolver.isPhysicalControlSkill).toBeTypeOf("function");
    expect(contract.core.sceneRuntime.isSceneSkillId).toBeTypeOf("function");
    expect(contract.capabilities.some((capability) => capability.kind === "scene")).toBe(true);
    expect(contract.capabilities.some((capability) => capability.kind === "evidence")).toBe(true);
  });
});
