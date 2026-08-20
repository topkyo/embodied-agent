import {
  allocateAgentDataDir,
  releaseAgentDataDir,
} from "../../apps/api/src/test/isolated-data-dir.js";
import { seedCanonicalSimRegistry } from "../../apps/api/src/test/registry-fixture.js";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { bindScriptRuntime } from "./bind-script-runtime.js";
import { getAllSceneSkillIds, missingScenes } from "./flywheel-scene-catalog.js";

let testDir: string;

describe("flywheel-scene-catalog", () => {
  beforeAll(async () => {
    testDir = allocateAgentDataDir("flywheel-catalog");
    process.env.ACTIVE_DOMAIN = "agriculture";
    seedCanonicalSimRegistry();
    await bindScriptRuntime();
  });

  afterAll(() => {
    delete process.env.ACTIVE_DOMAIN;
    releaseAgentDataDir(testDir);
  });

  it("lists 8 L3 scene skills", () => {
    expect(getAllSceneSkillIds()).toHaveLength(8);
  });

  it("missingScenes when all covered", () => {
    const outcomeScenes = [
      "night_ventilation_control",
      "high_temp_emergency_response",
      "humidity_mildew_prevention",
      "post_irrigation_ventilation",
    ] as const;
    const attestationScenes = [
      "cold_wave_protection",
      "morning_dew_reduction",
      "worker_manual_override_review",
      "device_efficiency_diagnosis",
    ] as const;
    expect(missingScenes([...outcomeScenes], [...attestationScenes])).toEqual([]);
  });

  it("missingScenes respects via_outcome vs via_attestation", () => {
    expect(missingScenes(["high_temp_emergency_response"], [])).not.toContain(
      "high_temp_emergency_response",
    );
    expect(missingScenes([], ["cold_wave_protection"])).not.toContain("cold_wave_protection");
    expect(missingScenes([], [])).toHaveLength(8);
  });
});
