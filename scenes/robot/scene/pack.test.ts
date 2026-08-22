import { describe, expect, it } from "vitest";
import { assertDomainPackConformance } from "@embodied-agent/domain-sdk";
import { createDomainPackContract, createDomainPackCore } from "./pack.js";
import { evaluateOutcomeSuccess, extractRobotOutcomeMetrics } from "./registry.js";

describe("robotics domain pack", () => {
  it("passes domain-sdk conformance gate", () => {
    assertDomainPackConformance(createDomainPackContract());
  });

  it("is a live deliverable pack with required contracts", () => {
    const contract = createDomainPackContract();
    expect(contract.core.manifest.status).toBe("live");
    expect(contract.core.skills.p0).toContain("robot.query_status");
    expect(contract.core.skills.physical.length).toBeGreaterThan(0);
    expect(contract.core.intentSchemas.length).toBeGreaterThan(0);
    expect(contract.core.prompt.contract).toContain("robot.query_status");
    expect(contract.core.safety).toBeDefined();
    expect(contract.core.readiness?.requiredTransports).toContain("m20_http");
    expect(contract.core.readiness?.flywheelGate?.adapterModule).toContain("domain-robotics");
    expect(contract.core.commandAdapter?.physicalExecutor).toBeDefined();
    expect(contract.core.commandAdapter?.commandReplies?.commandStatusMessage).toBeTypeOf(
      "function",
    );
  });

  it("builds robot sit_down command patches", () => {
    const core = createDomainPackCore();
    const target = {
      deployment_id: "dep-robot-dogfood-001",
      node_id: "node-m20-001",
      device: {
        device_id: "m20-001",
        deployment_id: "dep-robot-dogfood-001",
        entity_id: "m20-001",
        device_type: "robot_dog",
        name: "M20",
        aliases: [],
        node_id: "node-m20-001",
        status: "active" as const,
        transport: "m20_http" as const,
      },
    };
    expect(
      core.commandAdapter?.commandBuilder?.buildCommandPatch(
        {
          skill: "robot.sit_down",
          target: {},
          parameters: {},
        },
        target,
      ),
    ).toEqual({
      action: "sit_down",
      parameters: {},
    });
  });
});

describe("robot outcome quantification", () => {
  function makeInput(
    overrides: Partial<{
      command_status: string;
      evidence_count: number;
      anomaly_count: number;
      repeated_anomaly_waypoints: unknown[];
    }>,
  ) {
    return {
      scene_skill_id: "robot_visual_inspection",
      command_status: overrides.command_status ?? "completed",
      window_minutes: 0,
      after: {
        entity_id: "m20-001",
        evidence_count: overrides.evidence_count ?? 0,
        anomaly_count: overrides.anomaly_count ?? 0,
        repeated_anomaly_waypoints: overrides.repeated_anomaly_waypoints ?? [],
      },
    };
  }

  it("succeeds when completed with zero anomalies", () => {
    const input = makeInput({});
    expect(evaluateOutcomeSuccess(input)).toBe(true);
    expect(extractRobotOutcomeMetrics(input).success).toBe(true);
  });

  it("succeeds at flywheel-aligned thresholds (anomaly_count=2, repeated=1)", () => {
    const input = makeInput({
      evidence_count: 3,
      anomaly_count: 2,
      repeated_anomaly_waypoints: [{ waypoint_id: "dock", count: 2 }],
    });
    const metrics = extractRobotOutcomeMetrics(input);
    expect(metrics.evidence_count).toBe(3);
    expect(metrics.anomaly_count).toBe(2);
    expect(metrics.repeated_anomaly_waypoints).toBe(1);
    expect(metrics.success).toBe(true);
  });

  it("fails when anomaly_count exceeds threshold", () => {
    const input = makeInput({ anomaly_count: 3 });
    expect(evaluateOutcomeSuccess(input)).toBe(false);
  });

  it("fails when repeated_anomaly_waypoints exceeds threshold", () => {
    const input = makeInput({
      anomaly_count: 2,
      repeated_anomaly_waypoints: [
        { waypoint_id: "dock", count: 2 },
        { waypoint_id: "yard", count: 2 },
      ],
    });
    expect(evaluateOutcomeSuccess(input)).toBe(false);
  });

  it("fails when command not completed", () => {
    const input = makeInput({ command_status: "failed" });
    expect(evaluateOutcomeSuccess(input)).toBe(false);
  });

  it("fails visibly when anomaly telemetry is missing", () => {
    expect(
      evaluateOutcomeSuccess({
        scene_skill_id: "robot_visual_inspection",
        command_status: "completed",
        window_minutes: 0,
      }),
    ).toBe(false);
    expect(
      evaluateOutcomeSuccess({
        scene_skill_id: "robot_visual_inspection",
        command_status: "completed",
        window_minutes: 0,
        after: { entity_id: "m20-001", evidence_count: 1 },
      }),
    ).toBe(false);
  });

  it("extracts metrics from after slice", () => {
    const input = makeInput({
      evidence_count: 5,
      anomaly_count: 1,
      repeated_anomaly_waypoints: [],
    });
    const metrics = extractRobotOutcomeMetrics(input);
    expect(metrics).toEqual({
      evidence_count: 5,
      anomaly_count: 1,
      repeated_anomaly_waypoints: 0,
      success: true,
    });
  });
});
