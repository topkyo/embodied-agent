import { describe, expect, it } from "vitest";
import { z } from "zod";
import type {
  DomainPackCore,
  DomainPackCapability,
  DomainPackCapabilityKind,
  DomainPackContract,
  DomainPackContractFactory,
  DomainPackFactoryContext,
  SceneCapability,
  NlgCapability,
  OpsCapability,
  EvidenceCapability,
} from "./domain-pack-contract-aggregate.js";
import type { DomainPackManifest } from "./domain-pack-manifest.js";
import type { IntentPayload } from "./schemas/intent.js";
import type { DeviceRegistry } from "./registry.js";

function makeManifest(): DomainPackManifest {
  return {
    id: "test-pack",
    displayName: "Test Pack",
    status: "live",
    eval: {
      golden: "eval/golden.csv",
      matrixExtra: "eval/matrix-extra.csv",
      matrixWechat: "eval/matrix-wechat.csv",
      matrixNegative: "eval/matrix-negative.csv",
    },
  };
}

function makeCore(): DomainPackCore {
  return {
    manifest: makeManifest(),
    skills: {
      p0: ["device.query_status"],
      p1: ["zone.activate"],
      physical: ["device.start"],
    },
    intentSchemas: [z.object({ skill: z.literal("device.start") })] as readonly z.ZodTypeAny[],
    prompt: {
      section: "test section",
      contract: "test contract",
    },
    eval: {
      golden: "eval/golden.csv",
      matrixExtra: "eval/matrix-extra.csv",
      matrixWechat: "eval/matrix-wechat.csv",
      matrixNegative: "eval/matrix-negative.csv",
    },
    structuralOverrides: {
      refineIntentFromUtterance: (_utterance, intent) => intent,
    },
    targetResolver: {
      isPhysicalControlSkill: (intent: IntentPayload) => intent.skill === "device.start",
      resolveDeviceTarget: (
        _intent: IntentPayload,
        _registry: DeviceRegistry,
        _context: { deployment_id: string; domainConfig?: unknown },
      ) => ({
        ok: false,
        reason: "not found",
      }),
    },
    sceneRuntime: {
      sceneSkillIds: ["scene.greenhouse.vent"],
      isSceneSkillId: (id: string) => id === "scene.greenhouse.vent",
      resolveSceneForTrigger: () => null,
      resolveSceneFromIntent: () => null,
      evaluateOutcomeSuccess: () => true,
      sceneSuccessMetric: () => "temperature_c",
      riskLevelForScene: () => "L3",
      riskLevelForPhysicalSkill: () => "L2",
      outcomeThresholdsForScene: () => ({ temperature_delta_max: 5 }),
    },
    context: {
      buildDeploymentContext: () => ({ scene_context_sections: [] }),
    },
  };
}

describe("DomainPackCore type contract", () => {
  it("builds a valid DomainPackCore with required fields", () => {
    const core = makeCore();
    expect(core.manifest.id).toBe("test-pack");
    expect(core.skills.p0).toContain("device.query_status");
    expect(core.skills.physical).toContain("device.start");
    expect(core.prompt.section).toBe("test section");
  });

  it("supports optional physicalDefinitions in skills", () => {
    const core: DomainPackCore = {
      ...makeCore(),
      skills: {
        ...makeCore().skills,
        physicalDefinitions: [
          {
            skill: "device.start",
            display: {
              title_zh: "启动设备",
              icon: "power",
              summary_zh: "启动指定设备",
            },
          },
        ],
      },
    };
    expect(core.skills.physicalDefinitions?.[0].skill).toBe("device.start");
    expect(core.skills.physicalDefinitions?.[0].display.title_zh).toBe("启动设备");
  });

  it("supports optional safety policy", () => {
    const core: DomainPackCore = {
      ...makeCore(),
      safety: {
        authorization: {
          controlSkills: ["device.start"],
          workerAllowedSkills: ["device.query_status"],
          readonlyAllowedSkills: [],
        },
        confirmDurationThresholdSeconds: 300,
      },
    };
    expect(core.safety?.confirmDurationThresholdSeconds).toBe(300);
    expect(core.safety?.authorization.controlSkills).toContain("device.start");
  });

  it("supports optional commandAdapter", () => {
    const core: DomainPackCore = {
      ...makeCore(),
      commandAdapter: {
        commandBuilder: {
          buildCommandPatch: () => ({
            action: "domain.custom_action",
            parameters: {},
          }),
        },
      },
    };
    expect(core.commandAdapter?.commandBuilder?.buildCommandPatch).toBeDefined();
  });

  it("supports optional readiness", () => {
    const core: DomainPackCore = {
      ...makeCore(),
      readiness: {
        requiredTransports: ["mqtt"],
        probeNotRequired: { reason: "no probe needed" },
      },
    };
    expect(core.readiness?.requiredTransports).toContain("mqtt");
    expect(core.readiness?.probeNotRequired?.reason).toBe("no probe needed");
  });

  it("supports optional intentProcessing in prompt", () => {
    const core: DomainPackCore = {
      ...makeCore(),
      prompt: {
        section: "test section",
        contract: "test contract",
        processing: {
          isLowConfidenceControlSkill: (skill: string) => skill === "device.start",
        },
      },
    };
    expect(core.prompt.processing?.isLowConfidenceControlSkill?.("device.start")).toBe(true);
  });
});

describe("DomainPackCapability variants", () => {
  it("builds a SceneCapability", () => {
    const cap: SceneCapability = {
      kind: "scene",
      runtime: makeCore().sceneRuntime,
    };
    expect(cap.kind).toBe("scene");
    expect(cap.runtime.sceneSkillIds).toContain("scene.greenhouse.vent");
  });

  it("builds an NlgCapability", () => {
    const cap: NlgCapability = {
      kind: "nlg",
      config: {
        eligibleSkills: ["device.query_status"],
        replySystemPrompt: "You are a helpful assistant",
      },
    };
    expect(cap.kind).toBe("nlg");
    expect(cap.config.eligibleSkills).toContain("device.query_status");
  });

  it("builds an OpsCapability", () => {
    const cap: OpsCapability = {
      kind: "ops",
    };
    expect(cap.kind).toBe("ops");
    expect(cap.schema).toBeUndefined();
  });

  it("builds an EvidenceCapability", () => {
    const cap: EvidenceCapability = {
      kind: "evidence",
      eval: makeManifest().eval,
    };
    expect(cap.kind).toBe("evidence");
    expect(cap.eval.golden).toBe("eval/golden.csv");
  });

  it("builds a generic extension capability", () => {
    const cap: DomainPackCapability = {
      kind: "digest",
      value: { template: "morning" },
    };
    expect(cap.kind).toBe("digest");
  });

  it("supports requiredServices on capabilities", () => {
    const cap: SceneCapability = {
      kind: "scene",
      runtime: makeCore().sceneRuntime,
      requiredServices: ["telemetry", "memory"],
    };
    expect(cap.requiredServices).toContain("telemetry");
  });

  it("DomainPackCapabilityKind covers all expected kinds", () => {
    const kinds: DomainPackCapabilityKind[] = [
      "scene",
      "nlg",
      "ops",
      "evidence",
      "skill-handler",
      "command-replies",
      "clarification",
      "pre-dispatch",
      "conversation",
      "mode-store",
      "proactive-alerts",
      "scheduled-reports",
      "policy-suggestions",
      "command-hooks",
      "digest",
      "weekly-advice",
      "weather-proactive",
      "satellite",
      "extension",
    ];
    expect(kinds).toHaveLength(19);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe("DomainPackContract", () => {
  it("assembles core and capabilities into a contract", () => {
    const contract: DomainPackContract = {
      core: makeCore(),
      capabilities: [
        { kind: "scene", runtime: makeCore().sceneRuntime },
        { kind: "nlg", config: { eligibleSkills: [], replySystemPrompt: "test" } },
        { kind: "ops" },
      ],
    };
    expect(contract.core.manifest.id).toBe("test-pack");
    expect(contract.capabilities).toHaveLength(3);
    expect(contract.capabilities[0].kind).toBe("scene");
  });

  it("accepts empty capabilities array", () => {
    const contract: DomainPackContract = {
      core: makeCore(),
      capabilities: [],
    };
    expect(contract.capabilities).toEqual([]);
  });
});

describe("DomainPackContractFactory", () => {
  it("factory returns a DomainPackContract", () => {
    const factory: DomainPackContractFactory = () => ({
      core: makeCore(),
      capabilities: [{ kind: "scene", runtime: makeCore().sceneRuntime }],
    });
    const contract = factory();
    expect(contract.core.manifest.id).toBe("test-pack");
  });

  it("factory accepts optional DomainPackFactoryContext with storage", () => {
    const context: DomainPackFactoryContext = {
      storage: {
        dataRoot: () => "/tmp/test-data",
        atomicWriteJson: () => {},
      },
    };
    const factory: DomainPackContractFactory = (options) => {
      expect(options?.storage?.dataRoot()).toBe("/tmp/test-data");
      return {
        core: makeCore(),
        capabilities: [],
      };
    };
    const contract = factory(context);
    expect(contract.core.manifest.id).toBe("test-pack");
  });

  it("factory can be called with no options", () => {
    const factory: DomainPackContractFactory = () => ({
      core: makeCore(),
      capabilities: [],
    });
    const contract = factory();
    expect(contract.capabilities).toEqual([]);
  });
});
