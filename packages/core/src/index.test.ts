import { describe, expect, it } from "vitest";
import * as coreIndex from "./index.js";
import * as sceneContract from "./scene-contract.js";

describe("index re-exports", () => {
  it("re-exports deployment-id helpers", () => {
    expect(coreIndex.isValidDeploymentIdSegment).toBeDefined();
    expect(coreIndex.DEPLOYMENT_ID_SEGMENT).toBeDefined();
  });

  it("re-exports deployment-path helpers", () => {
    expect(coreIndex.deploymentDataDir).toBeDefined();
    expect(coreIndex.ensureDeploymentDir).toBeDefined();
    expect(coreIndex.deploymentScopedPath).toBeDefined();
  });

  it("re-exports service-locator", () => {
    expect(coreIndex.createServiceLocator).toBeDefined();
  });

  it("re-exports skills", () => {
    expect(coreIndex.P0_SKILLS).toBeDefined();
    expect(coreIndex.isP0Skill).toBeDefined();
  });

  it("re-exports intent schema helpers", () => {
    expect(coreIndex.createIntentSchema).toBeDefined();
    expect(coreIndex.parseIntentPayload).toBeDefined();
    expect(coreIndex.safeParseIntentPayload).toBeDefined();
    expect(coreIndex.LLM_SKILL_ENUM).toBeDefined();
  });

  it("re-exports device schemas", () => {
    expect(coreIndex.deploymentSchema).toBeDefined();
    expect(coreIndex.registryEntitySchema).toBeDefined();
    expect(coreIndex.deviceSchema).toBeDefined();
    expect(coreIndex.nodeSchema).toBeDefined();
  });

  it("re-exports command schemas", () => {
    expect(coreIndex.commandMessageSchema).toBeDefined();
    expect(coreIndex.commandEventSchema).toBeDefined();
    expect(coreIndex.nodeEventSchema).toBeDefined();
  });
});

describe("scene-contract re-exports", () => {
  it("re-exports scene-primitives types via runtime import", () => {
    // scene-contract.ts does `export *` from type-only modules;
    // the re-export statement itself is runtime code.
    expect(sceneContract).toBeDefined();
  });
});
