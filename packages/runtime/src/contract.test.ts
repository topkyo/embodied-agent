import { describe, expect, it } from "vitest";
import type { DomainPackContract, DomainPackCore } from "@embodied-agent/core";
import { domainPackCapabilityKinds } from "./contract.js";
import { buildDomainPackOpsSchemaFromContract } from "./ops-schema.js";

function fakeCore(): DomainPackCore {
  const sceneRuntime = {
    sceneSkillIds: ["device.start"],
    isSceneSkillId: (id: string) => id === "device.start",
    resolveSceneForTrigger: () => null,
    resolveSceneFromIntent: () => null,
    evaluateOutcomeSuccess: () => true,
    sceneSuccessMetric: () => "completion" as const,
    riskLevelForScene: () => "L1" as const,
    riskLevelForPhysicalSkill: () => "L2" as const,
    outcomeThresholdsForScene: () => ({}),
  };

  return {
    manifest: {
      id: "test",
      displayName: "Test",
      status: "live",
      eval: {
        golden: "golden.jsonl",
        matrixExtra: "extra.jsonl",
        matrixWechat: "wechat.jsonl",
        matrixNegative: "negative.jsonl",
      },
    },
    skills: {
      p0: ["device.start"],
      p1: ["device.query"],
      physical: ["device.start"],
    },
    intentSchemas: [],
    prompt: {
      section: "prompt",
      contract: "contract",
    },
    eval: {
      golden: "golden.jsonl",
      matrixExtra: "extra.jsonl",
      matrixWechat: "wechat.jsonl",
      matrixNegative: "negative.jsonl",
    },
    structuralOverrides: {},
    targetResolver: {
      isPhysicalControlSkill: () => true,
      resolveDeviceTarget: () => ({ ok: false, reason: "test" }),
    },
    commandAdapter: {
      commandBuilder: {
        buildCommandPatch: () => ({ action: "start" }),
      },
      commandReplies: {},
    },
    safety: {
      confirmDurationThresholdSeconds: 600,
      authorization: {
        controlSkills: ["device.start"],
        workerAllowedSkills: [],
        readonlyAllowedSkills: [],
      },
    },
    readiness: {},
    sceneRuntime,
    context: {
      buildDeploymentContext: () => ({ scene_context_sections: [] }),
    },
  };
}

function fakeContract(): DomainPackContract {
  const core = fakeCore();
  return {
    core,
    capabilities: [
      { kind: "scene", runtime: core.sceneRuntime },
      { kind: "ops", schema: buildDomainPackOpsSchemaFromContract({ core, capabilities: [] }) },
      { kind: "evidence", eval: core.eval, readiness: core.readiness },
      {
        kind: "skill-handler",
        value: {
          serviceKeys: ["telemetry"],
          canHandle: () => true,
          handle: async () => ({ reply: "ok", params: {} }),
        },
        requiredServices: ["telemetry"],
      },
      { kind: "command-replies", value: {} },
      {
        kind: "nlg",
        config: {
          eligibleSkills: ["device.query"],
          replySystemPrompt: "reply",
        },
      },
      { kind: "satellite" },
    ],
  };
}

describe("DomainPack contract", () => {
  it("lists explicit capability kinds", () => {
    expect(domainPackCapabilityKinds(fakeContract())).toEqual(
      expect.arrayContaining([
        "scene",
        "ops",
        "evidence",
        "skill-handler",
        "command-replies",
        "nlg",
        "satellite",
      ]),
    );
  });

  it("builds an ops schema from contract core", () => {
    const contract = fakeContract();
    const schema = buildDomainPackOpsSchemaFromContract(contract);

    expect(schema.pack_id).toBe("test");
    expect(schema.navigation.tabs.map((tab) => tab.id)).toEqual(
      expect.arrayContaining(["overview", "settings", "devices", "users", "review", "platform"]),
    );
    expect(schema.devices.binding.physical_skills).toEqual(["device.start"]);
    expect(schema.eval_evidence.slices.map((slice) => slice.id)).toEqual([
      "golden",
      "matrix_extra",
      "matrix_wechat",
      "matrix_negative",
    ]);
  });
});
