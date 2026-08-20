import { describe, expect, it } from "vitest";
import { assertDomainPackConformance } from "@embodied-agent/domain-sdk";
import { createDomainPackContract, createDomainPackCore } from "./pack.js";

describe("agriculture greenhouse domain pack", () => {
  it("passes domain-sdk conformance gate", () => {
    assertDomainPackConformance(createDomainPackContract());
  });

  it("is a live deliverable pack with required contracts", () => {
    const contract = createDomainPackContract();
    expect(contract.core.manifest.status).toBe("live");
    expect(contract.core.skills.p0).toContain("greenhouse.query_status");
    expect(contract.core.skills.physical).toContain("fan.start");
    expect(contract.core.intentSchemas.length).toBeGreaterThan(0);
    expect(contract.core.prompt.contract).toContain("fan.start");
    expect(contract.core.safety).toBeDefined();
    expect(contract.core.readiness?.flywheelGate?.adapterModule).toContain("domain-agriculture");
    expect(contract.core.readiness?.requiredTransports).toContain("mqtt");
    const ops = contract.capabilities.find((cap) => cap.kind === "ops");
    const openVent = ops?.schema?.control.actions.find((a) => a.skill === "greenhouse.open_vent");
    expect(openVent?.display).toEqual({
      title_zh: "开天窗",
      icon: "wind",
      summary_zh: "调节顶部通风",
      control: { kind: "slider", unit: "%", demo_value: 40 },
    });
  });

  it("builds fan command patches", () => {
    const core = createDomainPackCore();
    const target = {
      deployment_id: "dep-gh-pilot-001",
      node_id: "node-sim-gh-001",
      device: {
        device_id: "fan-gh-001-01",
        deployment_id: "dep-gh-pilot-001",
        entity_id: "gh-001",
        device_type: "fan",
        name: "1号棚风机",
        aliases: [],
        node_id: "node-sim-gh-001",
        status: "active" as const,
      },
    };
    expect(
      core.commandAdapter?.commandBuilder?.buildCommandPatch(
        {
          skill: "fan.start",
          target: {},
          parameters: { duration_seconds: 600 },
        },
        target,
      ),
    ).toEqual({
      action: "start",
      parameters: { duration_seconds: 600 },
    });
  });
});
