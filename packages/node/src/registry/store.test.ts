import { allocateAgentDataDir, releaseAgentDataDir } from "@embodied-agent/platform";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadRegistry, validateRegistry } from "./store.js";
import { buildCanonicalSimRegistry } from "@embodied-agent/domain-agriculture";

const CANONICAL_SIM_REGISTRY = buildCanonicalSimRegistry();

let testDir: string;

describe("registry store", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    releaseAgentDataDir(testDir);
  });

  it("fails visibly when registry json is corrupt", () => {
    writeFileSync(resolve(testDir, "device-registry.json"), "{bad json", "utf8");
    expect(() => loadRegistry()).toThrow(/device-registry/);
  });

  it("requires explicit registry in every runtime mode", () => {
    expect(() => loadRegistry()).toThrow(/device-registry/);
  });

  it("loads an explicitly saved registry", () => {
    writeFileSync(
      resolve(testDir, "device-registry.json"),
      JSON.stringify(CANONICAL_SIM_REGISTRY),
      "utf8",
    );
    expect(loadRegistry().deployments[0]?.deployment_id).toBe("dep-gh-pilot-001");
  });

  it("validates device references", () => {
    const registry = {
      ...CANONICAL_SIM_REGISTRY,
      devices: [
        {
          ...CANONICAL_SIM_REGISTRY.devices[0]!,
          entity_id: "missing-gh",
        },
      ],
    };
    expect(() => validateRegistry(registry)).toThrow(/不存在的实体/);
  });
});
