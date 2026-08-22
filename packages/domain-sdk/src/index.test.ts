import { describe, expect, it } from "vitest";
import {
  assertDomainPackConformance,
  createPlaceholderSceneRuntime,
  createPlaceholderTargetResolver,
  createDomainPackOpsSchema,
  defineDomainPackContract,
  defineDomainPackCore,
  definePhysicalSkill,
  evaluateDomainPackConformance,
} from "./index.js";
import type { DomainPackContract, DomainPackCore, DomainPackRuntime } from "@embodied-agent/core";

function placeholderCore(): DomainPackCore {
  const sceneRuntime = createPlaceholderSceneRuntime("demo");
  return {
    manifest: {
      id: "demo",
      displayName: "Demo",
      status: "placeholder",
      eval: {
        golden: "golden.jsonl",
        matrixExtra: "extra.jsonl",
        matrixWechat: "wechat.jsonl",
        matrixNegative: "negative.jsonl",
      },
    },
    skills: { p0: [], p1: [], physical: [] },
    intentSchemas: [],
    prompt: {
      section: "",
      contract: "",
    },
    eval: {
      golden: "golden.jsonl",
      matrixExtra: "extra.jsonl",
      matrixWechat: "wechat.jsonl",
      matrixNegative: "negative.jsonl",
    },
    structuralOverrides: {},
    targetResolver: createPlaceholderTargetResolver(),
    sceneRuntime,
    context: {
      buildDeploymentContext: () => ({ scene_context_sections: [] }),
    },
  };
}

function placeholderContract(): DomainPackContract {
  const core = defineDomainPackCore(placeholderCore());
  return defineDomainPackContract({
    core,
    capabilities: [
      { kind: "scene", runtime: core.sceneRuntime },
      { kind: "ops", schema: createDomainPackOpsSchema(core) },
      { kind: "evidence", eval: core.eval, readiness: core.readiness },
    ],
  });
}

describe("domain-sdk", () => {
  it("preserves physical skill definitions", () => {
    expect(
      definePhysicalSkill({
        skill: "demo.start",
        display: { title_zh: "演示", icon: "activity" },
      }),
    ).toMatchObject({
      skill: "demo.start",
      physical: true,
    });
  });

  it("provides placeholder runtime helpers", () => {
    const runtime = createPlaceholderSceneRuntime("demo");
    expect(runtime.isSceneSkillId("demo.start")).toBe(false);
    expect(runtime.sceneSuccessMetric("demo.start")).toBe("completion");
    expect(createPlaceholderTargetResolver().resolveDeviceTarget()).toMatchObject({
      ok: false,
    });
  });

  it("reports explicit placeholder conformance gaps", () => {
    const contract = placeholderContract();
    const result = assertDomainPackConformance(contract);
    expect(result.deliverable).toBe(false);
    expect(result.capability_kinds).toEqual(expect.arrayContaining(["scene", "ops", "evidence"]));
    expect(evaluateDomainPackConformance(contract).issues.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "placeholder_pack",
        "skills_empty",
        "intent_schemas_empty",
        "intent_contract_empty",
        "safety_missing",
      ]),
    );
  });

  it("validates contract capabilities explicitly", () => {
    const result = assertDomainPackConformance(placeholderContract());

    expect(result.deliverable).toBe(false);
    expect(result.capability_kinds).toEqual(["scene", "ops", "evidence"]);
    expect(result.issues.map((item) => item.code)).not.toContain("ops_capability_missing");
    expect(result.issues.map((item) => item.code)).not.toContain("ops_schema_invalid");
  });

  it("reports missing required contract capabilities", () => {
    const contract = placeholderContract();
    const result = evaluateDomainPackConformance({
      ...contract,
      capabilities: contract.capabilities.filter((capability) => capability.kind !== "ops"),
    });

    expect(result.issues.map((item) => item.code)).toContain("ops_capability_missing");
  });

  it("rejects sceneRuntime that reports success on missing telemetry", () => {
    // 漂移负例：非 completion metric 在缺失 before/after 遥测时判 true。
    const badSceneRuntime: DomainPackRuntime = {
      sceneSkillIds: ["demo_scene"],
      isSceneSkillId: (id) => id === "demo_scene",
      resolveSceneForTrigger: () => null,
      resolveSceneFromIntent: () => null,
      evaluateOutcomeSuccess: (input) => input.command_status === "completed",
      sceneSuccessMetric: () => "temperature",
      riskLevelForScene: () => "L2",
      riskLevelForPhysicalSkill: () => "L2",
      outcomeThresholdsForScene: () => ({}),
    };
    const core = { ...placeholderCore(), sceneRuntime: badSceneRuntime };
    const contract: DomainPackContract = {
      core,
      capabilities: [
        { kind: "scene", runtime: badSceneRuntime },
        { kind: "ops", schema: createDomainPackOpsSchema(core) },
        { kind: "evidence", eval: core.eval, readiness: core.readiness },
      ],
    };

    expect(evaluateDomainPackConformance(contract).issues.map((item) => item.code)).toContain(
      "scene_outcome_missing_telemetry_success",
    );

    const liveContract: DomainPackContract = {
      ...contract,
      core: { ...core, manifest: { ...core.manifest, status: "live" } },
    };
    expect(() => assertDomainPackConformance(liveContract)).toThrow(/缺失遥测/);
  });

  it("rejects sceneRuntime that reports success on failed command", () => {
    const badSceneRuntime: DomainPackRuntime = {
      sceneSkillIds: ["demo_scene"],
      isSceneSkillId: (id) => id === "demo_scene",
      resolveSceneForTrigger: () => null,
      resolveSceneFromIntent: () => null,
      // 漂移负例：不看 command_status，只看遥测 delta。
      evaluateOutcomeSuccess: (input) =>
        typeof input.after?.temperature_c === "number" &&
        typeof input.before?.temperature_c === "number" &&
        input.after.temperature_c < input.before.temperature_c,
      sceneSuccessMetric: () => "temperature",
      riskLevelForScene: () => "L2",
      riskLevelForPhysicalSkill: () => "L2",
      outcomeThresholdsForScene: () => ({}),
    };
    const core = { ...placeholderCore(), sceneRuntime: badSceneRuntime };
    const contract: DomainPackContract = {
      core,
      capabilities: [
        { kind: "scene", runtime: badSceneRuntime },
        { kind: "ops", schema: createDomainPackOpsSchema(core) },
        { kind: "evidence", eval: core.eval, readiness: core.readiness },
      ],
    };

    expect(evaluateDomainPackConformance(contract).issues.map((item) => item.code)).toContain(
      "scene_outcome_failed_status_success",
    );
  });

  it("reports incomplete contract ops schema", () => {
    const contract = placeholderContract();
    const result = evaluateDomainPackConformance({
      ...contract,
      capabilities: contract.capabilities.map((capability) =>
        capability.kind === "ops" ? { ...capability, schema: { pack_id: "demo" } } : capability,
      ),
    });

    expect(result.issues.map((item) => item.code)).toContain("ops_schema_invalid");
  });

  describe("channelOnboarding conformance", () => {
    function coreWithOnboarding(
      status: "live" | "placeholder",
      channelOnboarding?: { examples: string[] },
    ): DomainPackCore {
      return {
        ...placeholderCore(),
        manifest: {
          ...placeholderCore().manifest,
          status,
          ...(channelOnboarding ? { channelOnboarding } : {}),
        },
      };
    }

    function contractForCore(core: DomainPackCore): DomainPackContract {
      return {
        core,
        capabilities: [
          { kind: "scene", runtime: core.sceneRuntime },
          { kind: "ops", schema: createDomainPackOpsSchema(core) },
          { kind: "evidence", eval: core.eval, readiness: core.readiness },
        ],
      };
    }

    it("accepts two valid examples", () => {
      const core = coreWithOnboarding("live", {
        examples: ["1号棚温度多少", "开通风"],
      });
      const codes = evaluateDomainPackConformance(contractForCore(core)).issues.map(
        (item) => item.code,
      );
      expect(codes).not.toContain("channel_onboarding_missing");
      expect(codes).not.toContain("channel_onboarding_examples_count");
      expect(codes).not.toContain("channel_onboarding_example_empty");
      expect(codes).not.toContain("channel_onboarding_examples_invalid");
    });

    it("rejects empty examples array", () => {
      const core = coreWithOnboarding("live", { examples: [] });
      expect(
        evaluateDomainPackConformance(contractForCore(core)).issues.map((item) => item.code),
      ).toContain("channel_onboarding_examples_count");
    });

    it("rejects more than four examples", () => {
      const core = coreWithOnboarding("live", {
        examples: ["a", "b", "c", "d", "e"],
      });
      expect(
        evaluateDomainPackConformance(contractForCore(core)).issues.map((item) => item.code),
      ).toContain("channel_onboarding_examples_count");
    });

    it("rejects whitespace-only example strings", () => {
      const core = coreWithOnboarding("live", { examples: ["valid", "   "] });
      expect(
        evaluateDomainPackConformance(contractForCore(core)).issues.map((item) => item.code),
      ).toContain("channel_onboarding_example_empty");
    });

    it("requires channelOnboarding for live packs", () => {
      const core = coreWithOnboarding("live");
      const contract = contractForCore(core);
      expect(evaluateDomainPackConformance(contract).issues.map((item) => item.code)).toContain(
        "channel_onboarding_missing",
      );
      expect(() => assertDomainPackConformance(contract)).toThrow(/channel_onboarding_missing/);
    });

    it("allows placeholder without channelOnboarding", () => {
      const core = coreWithOnboarding("placeholder");
      const codes = evaluateDomainPackConformance(contractForCore(core)).issues.map(
        (item) => item.code,
      );
      expect(codes).not.toContain("channel_onboarding_missing");
      expect(codes).not.toContain("channel_onboarding_examples_count");
    });
  });
});
