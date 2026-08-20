import type { IntentPayload, SceneResolvedDeviceTarget } from "@embodied-agent/core";
import { describe, expect, it } from "vitest";
import {
  buildDomainCommandPatch,
  domainPhysicalFailureCode,
  executeDomainPhysicalCommand,
  isPhysicalControlSkill,
  resolveDeviceTarget,
} from "./physical-dispatch.js";
import {
  makeActiveRegistry,
  makeRuntimeTestContext,
  makeTestContract,
  makeTestCore,
  TEST_DEPLOYMENT_ID,
  TEST_DEVICE_ID,
  TEST_NODE_ID,
} from "./test-runtime-context.js";

const CONTROL_INTENT: IntentPayload = {
  skill: "device.control",
  target: { device_id: TEST_DEVICE_ID },
  parameters: { duration_seconds: 60 },
  confidence: 1,
};

const QUERY_INTENT: IntentPayload = {
  skill: "device.query",
  target: {},
  parameters: {},
  confidence: 1,
};

function makeResolvedTarget(): SceneResolvedDeviceTarget {
  const device = makeActiveRegistry().devices[0]!;
  return {
    deployment_id: TEST_DEPLOYMENT_ID,
    node_id: TEST_NODE_ID,
    config_version: 1,
    transport: device.transport,
    device,
  };
}

describe("physical-dispatch", () => {
  it("detects physical control skills from active contract", () => {
    const ctx = makeRuntimeTestContext();
    expect(isPhysicalControlSkill(ctx, CONTROL_INTENT)).toBe(true);
    expect(isPhysicalControlSkill(ctx, QUERY_INTENT)).toBe(false);
  });

  it("returns unsupported reason when no physical resolver matches", () => {
    const core = makeTestCore({
      targetResolver: {
        isPhysicalControlSkill: () => false,
        resolveDeviceTarget: () => ({ ok: false, reason: "unused" }),
      },
    });
    const ctx = makeRuntimeTestContext({ contract: makeTestContract(core) });
    expect(resolveDeviceTarget(ctx, CONTROL_INTENT)).toEqual({
      ok: false,
      reason: "不支持的物理控制技能或目标无法解析。",
    });
  });

  it("returns preparePhysicalIntent failure reason", () => {
    const core = makeTestCore({
      targetResolver: {
        isPhysicalControlSkill: () => true,
        preparePhysicalIntent: () => ({ ok: false, reason: "缺少目标设备" }),
        resolveDeviceTarget: () => ({ ok: true, target: makeResolvedTarget() }),
      },
    });
    const ctx = makeRuntimeTestContext({ contract: makeTestContract(core) });
    expect(resolveDeviceTarget(ctx, CONTROL_INTENT)).toEqual({
      ok: false,
      reason: "缺少目标设备",
    });
  });

  it("resolves device target through active contract", () => {
    const target = makeResolvedTarget();
    const core = makeTestCore({
      targetResolver: {
        isPhysicalControlSkill: () => true,
        resolveDeviceTarget: (_intent, registry, opts) => {
          expect(registry.devices).toHaveLength(1);
          expect(opts.deployment_id).toBe(TEST_DEPLOYMENT_ID);
          return { ok: true, target };
        },
      },
    });
    const ctx = makeRuntimeTestContext({ contract: makeTestContract(core) });
    expect(resolveDeviceTarget(ctx, CONTROL_INTENT)).toEqual({ ok: true, target });
  });

  it("builds domain command patch when commandBuilder exists", () => {
    const target = makeResolvedTarget();
    const core = makeTestCore({
      targetResolver: {
        isPhysicalControlSkill: () => true,
        resolveDeviceTarget: () => ({ ok: true, target }),
      },
      commandAdapter: {
        commandReplies: {},
        commandBuilder: {
          buildCommandPatch: () => ({ action: "start", parameters: { duration_seconds: 60 } }),
        },
      },
    });
    const ctx = makeRuntimeTestContext({ contract: makeTestContract(core) });
    expect(buildDomainCommandPatch(ctx, CONTROL_INTENT, target)).toEqual({
      action: "start",
      parameters: { duration_seconds: 60 },
    });
  });

  it("returns null command patch when builder is absent", () => {
    const ctx = makeRuntimeTestContext();
    expect(buildDomainCommandPatch(ctx, CONTROL_INTENT, makeResolvedTarget())).toBeNull();
  });

  it("returns handled false when no physical executor matches", async () => {
    const ctx = makeRuntimeTestContext();
    await expect(
      executeDomainPhysicalCommand(ctx, CONTROL_INTENT, makeResolvedTarget()),
    ).resolves.toEqual({
      handled: false,
    });
  });

  it("executes domain physical command when executor matches", async () => {
    const target = makeResolvedTarget();
    const core = makeTestCore({
      commandAdapter: {
        commandReplies: {},
        physicalExecutor: {
          canExecuteTarget: () => true,
          execute: async () => ({ ok: true, transport: "mqtt" }),
          failureCode: "device_exec_failed",
        },
      },
    });
    const ctx = makeRuntimeTestContext({ contract: makeTestContract(core) });
    await expect(executeDomainPhysicalCommand(ctx, CONTROL_INTENT, target)).resolves.toEqual({
      handled: true,
      result: { ok: true, transport: "mqtt" },
      failureCode: "device_exec_failed",
      logFields: undefined,
    });
  });

  it("uses executor failure code or default", () => {
    const core = makeTestCore({
      commandAdapter: {
        commandReplies: {},
        physicalExecutor: {
          canExecuteTarget: () => true,
          execute: async () => ({}),
          failureCode: "custom_failure",
        },
      },
    });
    const ctx = makeRuntimeTestContext({ contract: makeTestContract(core) });
    expect(domainPhysicalFailureCode(ctx, makeResolvedTarget())).toBe("custom_failure");

    const ctxDefault = makeRuntimeTestContext();
    expect(domainPhysicalFailureCode(ctxDefault, makeResolvedTarget())).toBe(
      "domain_physical_executor_failed",
    );
  });
});
