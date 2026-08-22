import { allocateAgentDataDir, releaseAgentDataDir } from "@embodied-agent/platform";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, beforeEach } from "vitest";
import {
  isAmbiguousConfirmReply,
  readCompletedIrrigationCommands,
  readCompletedVentCommands,
  readPendingConfirm,
} from "./flywheel-e2e-lib.js";

let testDir: string;

describe("flywheel-e2e-lib", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("flywheel-e2e-lib");
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("detects ambiguous confirm replies", () => {
    expect(isAmbiguousConfirmReply("您有多个待确认操作，请说明。")).toBe(true);
    expect(isAmbiguousConfirmReply("当前没有待确认的操作。")).toBe(true);
    expect(isAmbiguousConfirmReply("已为您开通风 10 分钟。")).toBe(false);
  });

  it("reads pending-confirm rows from data dir", () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(
      resolve(testDir, "pending-confirm.json"),
      JSON.stringify([
        {
          user_id: "owner-001",
          conversation_id: "wx-flywheel-dev",
          intent: { skill: "greenhouse.open_vent" },
        },
      ]),
    );
    const rows = readPendingConfirm(testDir);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.intent?.skill).toBe("greenhouse.open_vent");
  });

  it("counts completed irrigation commands after timestamp", () => {
    const farm = resolve(testDir, "deployments", "dep-gh-pilot-001");
    mkdirSync(farm, { recursive: true });
    const since = Date.parse("2026-06-09T00:00:00.000Z");
    writeFileSync(
      resolve(farm, "command-logs.jsonl"),
      [
        JSON.stringify({
          status: "completed",
          updated_at: "2026-06-09T01:00:00.000Z",
          command: {
            device_id: "irrigation-sim-gh-001-zone-a",
            device_type: "irrigation_valve",
            action: "start",
          },
        }),
      ].join("\n") + "\n",
    );
    expect(readCompletedIrrigationCommands(testDir, "dep-gh-pilot-001", "gh-001", since)).toBe(1);
  });

  it("counts completed vent commands after timestamp", () => {
    const farm = resolve(testDir, "deployments", "dep-gh-pilot-001");
    mkdirSync(farm, { recursive: true });
    const since = Date.parse("2026-06-09T00:00:00.000Z");
    writeFileSync(
      resolve(farm, "command-logs.jsonl"),
      [
        JSON.stringify({
          status: "completed",
          updated_at: "2026-06-09T01:00:00.000Z",
          command: {
            device_id: "vent-sim-gh-002",
            device_type: "vent_motor",
            action: "open",
          },
        }),
      ].join("\n") + "\n",
    );
    expect(readCompletedVentCommands(testDir, "dep-gh-pilot-001", "gh-002", since)).toBe(1);
  });
});
