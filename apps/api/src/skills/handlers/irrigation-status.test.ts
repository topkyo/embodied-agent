import { allocateAgentDataDir, releaseAgentDataDir } from "../../test/isolated-data-dir.js";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCommands, createCommand, listCommands } from "../../commands/store.js";
import type { CommandMessage } from "@embodied-agent/core";
import { seedCanonicalSimRegistry } from "../../test/registry-fixture.js";
import { loadRegistry } from "@embodied-agent/node";
import {
  formatIrrigationQueryReply,
  isIrrigationActive,
  type IrrigationStatusServices,
} from "@embodied-agent/domain-agriculture";

let testDir: string;

function makeIrrigationCommand(opts: {
  status?: "running" | "completed";
  result?: Record<string, unknown>;
  device_id?: string;
}): void {
  const cmd: CommandMessage = {
    message_type: "command",
    protocol_version: "0.1",
    command_id: "cmd-irr-1",
    idempotency_key: "idem-1",
    deployment_id: "dep-gh-pilot-001",
    node_id: "node-sim-gh-001",
    device_id: opts.device_id ?? "irrigation-sim-gh-001",
    device_type: "irrigation_valve",
    action: "start",
    parameters: { duration_seconds: 900 },
    issued_by: {
      user_id: "owner-001",
      role: "owner",
      platform: "wechat",
      conversation_id: "wx-1",
    },
    created_at: "2026-06-08T10:00:00.000Z",
    expires_at: "2026-06-08T10:30:00.000Z",
  };
  const record = createCommand(cmd);
  if (opts.status) {
    record.status = opts.status;
    record.updated_at = "2026-06-08T10:01:00.000Z";
    if (opts.result) record.result = opts.result;
  }
}

function services(): IrrigationStatusServices {
  return {
    listDevices: () => loadRegistry().devices,
    listCommands,
  };
}

describe("irrigation.query_status", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    seedCanonicalSimRegistry();
    clearCommands();
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("reports active irrigation from command store", () => {
    makeIrrigationCommand({ status: "running" });
    const { reply } = formatIrrigationQueryReply(
      {
        zone_id: "zone-a",
        user_id: "owner-001",
      },
      services(),
    );
    expect(reply).toContain("正在灌溉");
    expect(reply).toContain("A区");
  });

  it("reports idle when latest start completed", () => {
    makeIrrigationCommand({
      status: "completed",
      result: { actual_duration_seconds: 600 },
    });
    const { reply } = formatIrrigationQueryReply(
      {
        zone_id: "zone-a",
        user_id: "owner-001",
      },
      services(),
    );
    expect(reply).toContain("当前未在灌溉");
    expect(reply).toContain("10 分钟");
  });

  it("detects active irrigation status", () => {
    makeIrrigationCommand({ status: "running" });
    const { params } = formatIrrigationQueryReply(
      {
        zone_id: "zone-a",
        user_id: "owner-001",
      },
      services(),
    );
    expect(params.any_active).toBe(true);
    expect(isIrrigationActive).toBeTypeOf("function");
  });
});
