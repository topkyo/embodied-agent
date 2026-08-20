import { beforeAll, describe, expect, it } from "vitest";
import {
  getDomainPackManifest,
  buildIntentSkillEnum,
  buildScenePromptSection,
  preloadDomainPacks,
  resolveActiveDomainPackContracts,
  resolveDomainPackContractById,
  safeParseActiveIntentPayload,
} from "./loader.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";

beforeAll(async () => {
  await preloadDomainPacks(getPlatformRuntimeContext().loader, {
    packIds: ["agriculture", "robotics", "aquaculture"],
  });
});

describe("domain-packs loader", () => {
  const holder = () => getPlatformRuntimeContext().loader;

  it("exports a runtime-only manifest without API admin route modules", () => {
    const robotics = getDomainPackManifest(holder()).find((entry) => entry.id === "robotics");

    expect(robotics).toMatchObject({
      id: "robotics",
      module: "@embodied-agent/domain-robotics",
      webSlug: "robot",
      status: "live",
    });
    expect(robotics).not.toHaveProperty("adminRouteModule");
  });

  it("returns greenhouse manifest when active_domain is set", () => {
    const contracts = resolveActiveDomainPackContracts(holder(), { active_domain: "agriculture" });
    expect(contracts).toHaveLength(1);
    expect(contracts[0]?.core.manifest.id).toBe("agriculture");
    expect(contracts[0]?.core.eval.golden).toContain("intent-golden.zh.jsonl");
    expect(contracts[0]?.core.eval.matrixNegative).toContain("sim-matrix-negative.jsonl");
    expect(contracts[0]?.core.skills.physical).toContain("greenhouse.open_vent");
    expect(
      contracts[0]?.core.targetResolver.isPhysicalControlSkill({
        skill: "greenhouse.open_vent",
        target: { greenhouse_id: "gh-001" },
        parameters: { duration_seconds: 60 },
      }),
    ).toBe(true);
  });

  it("returns robot manifest without greenhouse skills when robot is active", () => {
    const contracts = resolveActiveDomainPackContracts(holder(), { active_domain: "robotics" });
    expect(contracts).toHaveLength(1);
    expect(contracts[0]?.core.manifest.id).toBe("robotics");
    expect(contracts[0]?.core.skills.physical).toContain("robot.move");
    expect(contracts[0]?.core.skills.physical).toContain("robot.set_gait");
    expect(contracts[0]?.core.skills.physical).toContain("robot.play_audio");
    expect(contracts[0]?.core.skills.physical).toContain("robot.gimbal_move");
    expect(contracts[0]?.core.skills.physical).not.toContain("greenhouse.open_vent");
    expect(
      contracts[0]?.core.targetResolver.isPhysicalControlSkill({
        skill: "robot.set_gait",
        target: { robot_id: "m20-001" },
        parameters: { gait: "basic" },
      }),
    ).toBe(true);
    expect(
      contracts[0]?.core.targetResolver.isPhysicalControlSkill({
        skill: "robot.play_audio",
        target: { robot_id: "m20-001" },
        parameters: { file_name: "warning.mp3" },
      }),
    ).toBe(true);
    expect(
      contracts[0]?.core.targetResolver.isPhysicalControlSkill({
        skill: "robot.gimbal_move",
        target: { robot_id: "m20-001" },
        parameters: { direction: "left", duration_ms: 1500 },
      }),
    ).toBe(true);
  });

  it("throws when active_domain is missing", () => {
    expect(() => resolveActiveDomainPackContracts(holder(), {})).toThrow(/active_domain/);
    expect(() => resolveActiveDomainPackContracts(holder(), { active_domain: "" })).toThrow(
      /active_domain/,
    );
  });

  it("throws for unknown pack id", () => {
    expect(() =>
      resolveActiveDomainPackContracts(holder(), { active_domain: "unknown-pack" }),
    ).toThrow(/未知 Domain Pack/);
  });

  it("throws for placeholder active_domain", () => {
    expect(() =>
      resolveActiveDomainPackContracts(holder(), { active_domain: "aquaculture" }),
    ).toThrow(/placeholder/);
  });

  it("loads explicit DomainPackContract exports before projecting legacy pack shape", () => {
    const contract = resolveDomainPackContractById(holder(), "aquaculture");

    expect(contract.core.manifest.id).toBe("aquaculture");
    expect(contract.capabilities.map((capability) => capability.kind)).toEqual(
      expect.arrayContaining(["scene", "ops", "evidence"]),
    );
    const ops = contract.capabilities.find((capability) => capability.kind === "ops");
    expect(ops?.schema?.schema_version).toBe(1);
    expect(ops?.schema?.control.actions).toEqual([]);
  });

  it("buildScenePromptSection includes greenhouse mapping rules", () => {
    const section = buildScenePromptSection(holder(), {
      active_domain: "agriculture",
    });
    expect(section).toContain("greenhouse.set_mode");
    expect(section).toContain("fan.start");
  });

  it("builds runtime skill enum from platform and active Domain Pack", () => {
    const skillEnum = buildIntentSkillEnum(holder(), {
      active_domain: "agriculture",
    });
    expect(skillEnum).toContain("greenhouse.open_vent");
    expect(skillEnum).toContain("irrigation.start");
    expect(skillEnum).toContain("alert.set_threshold");
    expect(skillEnum).toContain("clarification_needed");
  });

  it("builds runtime skill enum from robot scene only when robot is active", () => {
    const skillEnum = buildIntentSkillEnum(holder(), {
      active_domain: "robotics",
    });
    expect(skillEnum).toContain("robot.move");
    expect(skillEnum).toContain("robot.navigate_to_waypoint");
    expect(skillEnum).toContain("robot.gimbal_move");
    expect(skillEnum).toContain("robot.set_volume");
    expect(skillEnum).toContain("robot.get_stream_url");
    expect(skillEnum).not.toContain("greenhouse.open_vent");
    expect(skillEnum).toContain("clarification_needed");
  });

  it("validates active Domain Pack intents through runtime schemas", () => {
    const parsed = safeParseActiveIntentPayload(
      holder(),
      {
        skill: "greenhouse.open_vent",
        target: { greenhouse_id: "gh-001" },
        parameters: { duration_seconds: 60 },
      },
      { active_domain: "agriculture" },
    );
    expect(parsed.success).toBe(true);

    const invalid = safeParseActiveIntentPayload(
      holder(),
      {
        skill: "gpio.set_pin",
        target: {},
        parameters: {},
      },
      { active_domain: "agriculture" },
    );
    expect(invalid.success).toBe(false);
  });
});
