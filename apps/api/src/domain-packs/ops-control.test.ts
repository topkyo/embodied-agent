import { describe, expect, it } from "vitest";
import type { DomainPackOpsAction } from "@embodied-agent/core";
import { createDomainPackContract as createAgricultureContract } from "@embodied-agent/domain-agriculture";
import { createDomainPackContract as createIndustrialContract } from "@embodied-agent/domain-industrial";
import { createDomainPackContract as createRoboticsContract } from "@embodied-agent/domain-robotics";
import { resolveOpsControlIntent } from "./ops-control.js";

describe("resolveOpsControlIntent", () => {
  it("resolves industrial exhaust with default cabinet and duration", () => {
    const action: DomainPackOpsAction = {
      id: "industrial.start_exhaust",
      label: "启动排风",
      skill: "industrial.start_exhaust",
      physical: true,
      requires_confirmation: true,
      parameters: { duration_seconds: 600 },
    };
    const intent = resolveOpsControlIntent(createIndustrialContract(), action, {
      deployment_id: "dep-industrial-ci-001",
      domainConfig: { default_cabinet_id: "cabinet-001" },
      registry: {
        deployments: [],
        entities: [],
        nodes: [],
        devices: [],
      },
    });
    expect(intent.skill).toBe("industrial.start_exhaust");
    if (intent.skill === "industrial.start_exhaust") {
      const params = intent.parameters as { duration_seconds?: number };
      const target = intent.target as { cabinet_id?: string };
      expect(target.cabinet_id).toBe("cabinet-001");
      expect(params.duration_seconds).toBe(600);
    }
  });

  it("resolves robotics control with default_robot_id", () => {
    const intent = resolveOpsControlIntent(
      createRoboticsContract(),
      {
        id: "robot.stand_up",
        label: "站立",
        skill: "robot.stand_up",
        physical: true,
        requires_confirmation: true,
      },
      {
        deployment_id: "dep-robot-ci-001",
        domainConfig: { default_robot_id: "m20-001" },
        registry: {
          deployments: [],
          entities: [],
          nodes: [],
          devices: [],
        },
      },
    );
    expect(intent.skill).toBe("robot.stand_up");
    if (intent.skill === "robot.stand_up") {
      const target = intent.target as { robot_id?: string };
      expect(target.robot_id).toBe("m20-001");
    }
  });

  it("resolves greenhouse irrigation.start with active greenhouse entity", () => {
    const action: DomainPackOpsAction = {
      id: "irrigation.start",
      label: "启动灌溉",
      skill: "irrigation.start",
      physical: true,
      requires_confirmation: true,
      parameters: { duration_seconds: 600 },
    };
    const intent = resolveOpsControlIntent(createAgricultureContract(), action, {
      deployment_id: "dep-greenhouse-ci-001",
      domainConfig: {},
      registry: {
        deployments: [],
        entities: [
          {
            deployment_id: "dep-greenhouse-ci-001",
            entity_id: "gh-001",
            entity_type: "greenhouse",
            status: "active",
            name: "双棚模拟",
            domain_id: "agriculture",
            aliases: [],
          },
        ],
        nodes: [],
        devices: [],
      },
    });
    expect(intent.skill).toBe("irrigation.start");
    if (intent.skill === "irrigation.start") {
      const params = intent.parameters as { duration_seconds?: number };
      const target = intent.target as { zone_id?: string; greenhouse_id?: string };
      expect(target.zone_id).toBe("zone-a");
      expect(target.greenhouse_id).toBe("gh-001");
      expect(params.duration_seconds).toBe(600);
    }
  });

  it("throws when ops capability lacks resolveControlAction", () => {
    const contract = createIndustrialContract();
    const stripped = {
      ...contract,
      capabilities: contract.capabilities.map((capability) =>
        capability.kind === "ops"
          ? { kind: "ops" as const, schema: capability.schema }
          : capability,
      ),
    };
    expect(() =>
      resolveOpsControlIntent(
        stripped,
        {
          id: "industrial.start_exhaust",
          label: "x",
          skill: "industrial.start_exhaust",
          physical: true,
          requires_confirmation: true,
        },
        {
          deployment_id: "dep-industrial-ci-001",
          domainConfig: {},
          registry: { deployments: [], entities: [], nodes: [], devices: [] },
        },
      ),
    ).toThrow(/resolveControlAction/);
  });
});
