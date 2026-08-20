import { beforeEach, describe, expect, it } from "vitest";
import type { DeviceRegistry, DomainPackContract } from "@embodied-agent/core";
import {
  assertRequiredServices,
  assertRequiredServicesForPack,
  configurePlatformDomainServiceCatalog,
  createPlatformServiceHolder,
  pickPlatformDomainServices,
  registerPackBoundDomainServices,
  syncActivePackBoundDomainServices,
  type PlatformServiceHolder,
} from "./services.js";

function makeContract(requiredServices: string[]): DomainPackContract {
  return {
    core: { manifest: { id: "agriculture", status: "live" } },
    capabilities: [
      {
        kind: "skill-handler",
        value: {},
        requiredServices,
      },
    ],
  } as unknown as DomainPackContract;
}

const EMPTY_REGISTRY: DeviceRegistry = {
  deployments: [],
  entities: [],
  nodes: [],
  devices: [],
};

describe("platform runtime services", () => {
  let holder: PlatformServiceHolder;

  beforeEach(() => {
    holder = createPlatformServiceHolder();
  });

  it("selects default and pack-declared domain services", () => {
    holder.configure({
      commands: { list: () => [] },
      deviceRegistry: { listDevices: () => [] },
      telemetry: { getAll: () => [] },
    });

    expect(pickPlatformDomainServices(holder, ["telemetry"])).toEqual({
      commands: { list: expect.any(Function) },
      deviceRegistry: { listDevices: expect.any(Function) },
      telemetry: { getAll: expect.any(Function) },
    });
  });

  it("does not clear domainServices when partial configureRuntimeServices omits them", () => {
    holder.configure({
      commands: {},
      deviceRegistry: {},
    });
    holder.configureRuntimeServices({
      loadRegistry: () => EMPTY_REGISTRY,
    });
    expect(pickPlatformDomainServices(holder)).toEqual({
      commands: {},
      deviceRegistry: {},
    });
  });

  it("fails visibly when a pack requests an undeclared service", () => {
    holder.configure({
      commands: {},
      deviceRegistry: {},
    });

    expect(() => pickPlatformDomainServices(holder, ["missing"])).toThrow(
      /Domain Pack 请求了未知平台服务：missing/,
    );
  });

  it("asserts required services against the runtime catalog after sync", () => {
    configurePlatformDomainServiceCatalog(holder, {
      commands: {},
      deviceRegistry: {},
      telemetry: {},
    });
    registerPackBoundDomainServices(holder, "agriculture", {
      satelliteNdvi: {},
    });
    syncActivePackBoundDomainServices(holder, "agriculture");
    const contract = makeContract(["telemetry", "satelliteNdvi", "missing"]);

    expect(assertRequiredServices(holder, contract).map((issue) => issue.code)).toEqual([
      "missing_required_service",
    ]);
  });

  it("reports missing pack-bound services before sync", () => {
    configurePlatformDomainServiceCatalog(holder, {
      commands: {},
      deviceRegistry: {},
      telemetry: {},
    });
    registerPackBoundDomainServices(holder, "agriculture", {
      satelliteNdvi: {},
    });
    const contract = makeContract(["satelliteNdvi"]);

    expect(assertRequiredServices(holder, contract).map((issue) => issue.code)).toEqual([
      "missing_required_service",
    ]);
    expect(assertRequiredServicesForPack(holder, contract, "agriculture")).toEqual([]);
  });

  it("syncs only active pack bound services into runtime catalog", () => {
    configurePlatformDomainServiceCatalog(holder, {
      commands: {},
      deviceRegistry: {},
    });
    registerPackBoundDomainServices(holder, "agriculture", { satelliteNdvi: { ok: true } });
    registerPackBoundDomainServices(holder, "robotics", { robotOps: { ok: true } });

    syncActivePackBoundDomainServices(holder, "agriculture");
    expect(pickPlatformDomainServices(holder, ["satelliteNdvi"])).toEqual({
      commands: {},
      deviceRegistry: {},
      satelliteNdvi: { ok: true },
    });
    expect(() => pickPlatformDomainServices(holder, ["robotOps"])).toThrow(/robotOps/);

    syncActivePackBoundDomainServices(holder, "robotics");
    expect(pickPlatformDomainServices(holder, ["robotOps"])).toEqual({
      commands: {},
      deviceRegistry: {},
      robotOps: { ok: true },
    });
    expect(() => pickPlatformDomainServices(holder, ["satelliteNdvi"])).toThrow(/satelliteNdvi/);
  });

  it("exposes runtime services via holder and fails visibly when unconfigured", () => {
    expect(() => holder.getLoadRegistry()).toThrow(/loadRegistry 未配置/);
    expect(() => holder.getNodeRuntimeStatus()).toThrow(/getNodeRuntimeStatus 未配置/);
    expect(() => holder.getPreDispatchServices()).toThrow(/preDispatchServices 未配置/);

    const loadRegistry = () => EMPTY_REGISTRY;
    const getNodeRuntimeStatus = (): never => ({ online: false, reported_at: null }) as never;
    holder.configureRuntimeServices({
      loadRegistry,
      getNodeRuntimeStatus,
      preDispatchServices: { foo: {} },
    });

    expect(holder.getLoadRegistry()).toBe(loadRegistry);
    expect(holder.getNodeRuntimeStatus()).toBe(getNodeRuntimeStatus);
    expect(holder.getPreDispatchServices()).toEqual({ foo: {} });
  });
});
