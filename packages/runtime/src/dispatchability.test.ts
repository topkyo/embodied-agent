import type { CommandMessage } from "@embodied-agent/core";
import { describe, expect, it } from "vitest";
import { assertDispatchableCommand, assertDispatchableTarget } from "./dispatchability.js";
import {
  makeActiveRegistry,
  makeRuntimeTestContext,
  TEST_DEPLOYMENT_ID,
  TEST_DEVICE_ID,
  TEST_NODE_ID,
} from "./test-runtime-context.js";

function makeTarget(overrides: Partial<Parameters<typeof assertDispatchableTarget>[1]> = {}) {
  const registry = makeActiveRegistry();
  const device = registry.devices[0]!;
  return {
    deployment_id: TEST_DEPLOYMENT_ID,
    node_id: TEST_NODE_ID,
    config_version: 1,
    transport: device.transport,
    device,
    ...overrides,
  };
}

function makeCommand(overrides: Partial<CommandMessage> = {}): CommandMessage {
  return {
    message_type: "command",
    protocol_version: "0.1",
    command_id: "cmd-1",
    idempotency_key: "idem-1",
    deployment_id: TEST_DEPLOYMENT_ID,
    device_id: TEST_DEVICE_ID,
    node_id: TEST_NODE_ID,
    device_type: "test-device",
    action: "start",
    parameters: {},
    issued_by: {
      user_id: "u1",
      role: "operator",
      platform: "test",
      conversation_id: "c1",
    },
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

describe("dispatchability", () => {
  it("accepts an active online target", () => {
    const ctx = makeRuntimeTestContext();
    expect(assertDispatchableTarget(ctx, makeTarget())).toEqual({ ok: true });
  });

  it("rejects deployment mismatch", () => {
    const ctx = makeRuntimeTestContext();
    const result = assertDispatchableTarget(ctx, makeTarget({ deployment_id: "other-dep" }));
    expect(result).toEqual({
      ok: false,
      status: 403,
      code: "deployment_mismatch",
      reason: "目标设备不属于当前部署，指令未下发。",
    });
  });

  it("rejects inactive deployment", () => {
    const ctx = makeRuntimeTestContext({
      registry: makeActiveRegistry({
        deployments: [
          {
            deployment_id: TEST_DEPLOYMENT_ID,
            status: "disabled",
            name: "test",
            timezone: "Asia/Shanghai",
          },
        ],
      }),
    });
    expect(assertDispatchableTarget(ctx, makeTarget())).toMatchObject({
      ok: false,
      status: 503,
      code: "deployment_inactive",
    });
  });

  it("rejects inactive device", () => {
    const registry = makeActiveRegistry();
    registry.devices[0] = { ...registry.devices[0]!, status: "disabled" };
    const ctx = makeRuntimeTestContext({ registry });
    expect(assertDispatchableTarget(ctx, makeTarget())).toMatchObject({
      ok: false,
      code: "device_inactive",
    });
  });

  it("rejects node binding mismatch", () => {
    const ctx = makeRuntimeTestContext();
    expect(assertDispatchableTarget(ctx, makeTarget({ node_id: "other-node" }))).toMatchObject({
      ok: false,
      code: "node_binding_mismatch",
    });
  });

  it("rejects inactive node", () => {
    const registry = makeActiveRegistry();
    registry.nodes![0] = { ...registry.nodes![0]!, status: "disabled" };
    const ctx = makeRuntimeTestContext({ registry });
    expect(assertDispatchableTarget(ctx, makeTarget())).toMatchObject({
      ok: false,
      code: "node_inactive",
    });
  });

  it("rejects offline node runtime", () => {
    const ctx = makeRuntimeTestContext({ nodeOnline: false });
    expect(assertDispatchableTarget(ctx, makeTarget())).toMatchObject({
      ok: false,
      code: "node_offline",
    });
  });

  it("rejects command when device is missing from registry", () => {
    const ctx = makeRuntimeTestContext({ registry: makeActiveRegistry({ devices: [] }) });
    expect(assertDispatchableCommand(ctx, makeCommand())).toMatchObject({
      ok: false,
      code: "device_inactive",
    });
  });

  it("delegates command dispatchability to target checks", () => {
    const ctx = makeRuntimeTestContext({ nodeOnline: false });
    expect(assertDispatchableCommand(ctx, makeCommand())).toMatchObject({
      ok: false,
      code: "node_offline",
    });
  });
});
