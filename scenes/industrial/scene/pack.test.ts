import { describe, expect, it } from "vitest";
import { assertDomainPackConformance } from "@embodied-agent/domain-sdk";
import { createDomainPackContract, createDomainPackCore } from "./pack.js";
import { evaluateOutcomeSuccess } from "./registry.js";

describe("industrial domain pack", () => {
  it("passes domain-sdk conformance gate", () => {
    assertDomainPackConformance(createDomainPackContract());
  });

  it("is a live deliverable pack with required contracts", () => {
    const contract = createDomainPackContract();
    expect(contract.core.manifest.status).toBe("live");
    expect(contract.core.skills.p0).toContain("industrial.query_status");
    expect(contract.core.skills.physical).toContain("industrial.start_exhaust");
    expect(contract.core.intentSchemas.length).toBeGreaterThan(0);
    expect(contract.core.prompt.contract).toContain("industrial.start_exhaust");
    expect(contract.core.safety).toBeDefined();
    expect(contract.core.readiness?.requiredTransports).toContain("mqtt");
    expect(contract.core.readiness?.flywheelGate?.adapterModule).toContain("domain-industrial");
    expect(contract.core.commandAdapter?.commandReplies?.commandStatusMessage).toBeTypeOf(
      "function",
    );
  });

  it("builds exhaust command patches", () => {
    const core = createDomainPackCore();
    const target = {
      deployment_id: "dep-industrial-ci-001",
      node_id: "node-sim-industrial-001",
      device: {
        device_id: "fan-industrial-001",
        deployment_id: "dep-industrial-ci-001",
        entity_id: "cabinet-001",
        device_type: "fan",
        name: "排风风机",
        aliases: [],
        node_id: "node-sim-industrial-001",
        status: "active" as const,
      },
    };
    expect(
      core.commandAdapter?.commandBuilder?.buildCommandPatch(
        {
          skill: "industrial.start_exhaust",
          target: {},
          parameters: { duration_seconds: 600 },
        },
        target,
      ),
    ).toEqual({
      device_type: "fan",
      action: "start",
      parameters: { duration_seconds: 600 },
    });
  });

  describe("evaluateOutcomeSuccess", () => {
    const base = {
      scene_skill_id: "industrial_overheat_exhaust",
      command_status: "completed",
      window_minutes: 10,
    };

    const entity_id = "cabinet-001";

    it("fails when before/after telemetry is missing (no implicit success)", () => {
      expect(evaluateOutcomeSuccess({ ...base })).toBe(false);
      expect(evaluateOutcomeSuccess({ ...base, before: { entity_id, temperature_c: 42 } })).toBe(
        false,
      );
      expect(evaluateOutcomeSuccess({ ...base, after: { entity_id, temperature_c: 40 } })).toBe(
        false,
      );
    });

    it("fails when command is not completed", () => {
      expect(
        evaluateOutcomeSuccess({
          ...base,
          command_status: "failed",
          before: { entity_id, temperature_c: 42 },
          after: { entity_id, temperature_c: 39 },
        }),
      ).toBe(false);
    });

    it("succeeds only when temperature dropped by at least 1°C", () => {
      expect(
        evaluateOutcomeSuccess({
          ...base,
          before: { entity_id, temperature_c: 42 },
          after: { entity_id, temperature_c: 41 },
        }),
      ).toBe(true);
      expect(
        evaluateOutcomeSuccess({
          ...base,
          before: { entity_id, temperature_c: 42 },
          after: { entity_id, temperature_c: 41.5 },
        }),
      ).toBe(false);
    });
  });
});
