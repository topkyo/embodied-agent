import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateOutcomeSuccess, evaluateSceneOutcomeFromCommand } from "./evaluate-outcome.js";
import {
  appendSceneOutcome,
  aggregateSceneOutcomesByEntity,
  listSceneOutcomes,
  clearSceneOutcomesForTest,
  upsertSceneOutcomeByCommand,
} from "./outcome-store.js";
import type { CommandRecord } from "../commands/types.js";
import { getMemoryJournal } from "../memory/journal.js";

function baseRecord(partial: Partial<CommandRecord>): CommandRecord {
  return {
    command_id: "cmd-test-1",
    status: "completed",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    command: {
      message_type: "command",
      protocol_version: "0.1",
      command_id: "cmd-test-1",
      idempotency_key: "k1",
      deployment_id: "dep-gh-pilot-001",
      node_id: "node-sim-gh-001",
      device_id: "vent-sim-gh-001",
      device_type: "vent_motor",
      action: "open",
      parameters: { duration_seconds: 600 },
      issued_by: {
        user_id: "owner-001",
        role: "owner",
        platform: "wechat",
        conversation_id: "wx-1",
      },
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
    scene_skill_id: "night_ventilation_control",
    ...partial,
  };
}

describe("evaluate-outcome", () => {
  it("scores temperature success when delta < -0.5", () => {
    const record = baseRecord({
      telemetry_flywheel: {
        before: {
          entity_id: "gh-001",
          temperature_c: 31.2,
          humidity_percent: 78,
          vent_status: "closed",
          fan_status: "off",
          captured_at: new Date().toISOString(),
        },
        after: {
          entity_id: "gh-001",
          temperature_c: 29.8,
          humidity_percent: 72,
          vent_status: "open",
          fan_status: "off",
          captured_at: new Date().toISOString(),
        },
      },
    });
    expect(evaluateOutcomeSuccess("night_ventilation_control", record)).toBe(true);
  });

  it("appends scene outcome row on completed command", () => {
    const dir = mkdtempSync(join(tmpdir(), "scene-outcome-"));
    process.env.AGENT_DATA_DIR = dir;
    clearSceneOutcomesForTest("dep-gh-pilot-001");

    const record = baseRecord({
      telemetry_flywheel: {
        before: {
          entity_id: "gh-001",
          temperature_c: 32,
          humidity_percent: 80,
          vent_status: "closed",
          fan_status: "off",
          captured_at: new Date().toISOString(),
        },
        after: {
          entity_id: "gh-001",
          temperature_c: 30.8,
          humidity_percent: 75,
          vent_status: "open",
          fan_status: "off",
          captured_at: new Date().toISOString(),
        },
      },
    });

    const row = evaluateSceneOutcomeFromCommand(record);
    expect(row?.success).toBe(true);
    expect(row?.entity_id).toBe("gh-001");
    expect(row?.metrics.temperature_delta_c).toBeCloseTo(-1.2);

    const rows = listSceneOutcomes("dep-gh-pilot-001");
    expect(rows).toHaveLength(1);
    expect(rows[0].scene_skill_id).toBe("night_ventilation_control");
    delete process.env.AGENT_DATA_DIR;
  });

  it("does not write outcome when completed command has no after snapshot", () => {
    const dir = mkdtempSync(join(tmpdir(), "scene-outcome-missing-after-"));
    process.env.AGENT_DATA_DIR = dir;
    clearSceneOutcomesForTest("dep-gh-pilot-001");

    const row = evaluateSceneOutcomeFromCommand(baseRecord({ telemetry_flywheel: {} }));
    expect(row).toBeNull();
    expect(listSceneOutcomes("dep-gh-pilot-001")).toHaveLength(0);
    delete process.env.AGENT_DATA_DIR;
  });

  it("prefers delayed window snapshot over immediate after", () => {
    const record = baseRecord({
      telemetry_flywheel: {
        before: {
          entity_id: "gh-001",
          temperature_c: 32,
          humidity_percent: 80,
          vent_status: "closed",
          fan_status: "off",
          captured_at: new Date().toISOString(),
        },
        after: {
          entity_id: "gh-001",
          temperature_c: 31.8,
          humidity_percent: 79,
          vent_status: "open",
          fan_status: "off",
          captured_at: new Date().toISOString(),
        },
        windows: [
          {
            minutes: 15,
            captured_at: new Date().toISOString(),
            snapshot: {
              entity_id: "gh-001",
              temperature_c: 29.5,
              humidity_percent: 74,
              vent_status: "open",
              fan_status: "off",
              captured_at: new Date().toISOString(),
            },
          },
        ],
      },
    });
    expect(evaluateOutcomeSuccess("night_ventilation_control", record)).toBe(true);
  });

  it("scores post_irrigation_ventilation on humidity delta", () => {
    const record = baseRecord({
      scene_skill_id: "post_irrigation_ventilation",
      telemetry_flywheel: {
        before: {
          entity_id: "gh-001",
          temperature_c: 28,
          humidity_percent: 82,
          vent_status: "closed",
          fan_status: "off",
          captured_at: new Date().toISOString(),
        },
        after: {
          entity_id: "gh-001",
          temperature_c: 27.8,
          humidity_percent: 76,
          vent_status: "open",
          fan_status: "off",
          captured_at: new Date().toISOString(),
        },
      },
    });
    expect(evaluateOutcomeSuccess("post_irrigation_ventilation", record)).toBe(true);
  });

  it("upsert updates same command_id without duplicating rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "scene-upsert-"));
    process.env.AGENT_DATA_DIR = dir;
    clearSceneOutcomesForTest("dep-gh-pilot-001");
    upsertSceneOutcomeByCommand({
      deployment_id: "dep-gh-pilot-001",
      scene_skill_id: "night_ventilation_control",
      command_id: "cmd-upsert-1",
      success: false,
      metrics: {},
    });
    upsertSceneOutcomeByCommand({
      deployment_id: "dep-gh-pilot-001",
      scene_skill_id: "night_ventilation_control",
      command_id: "cmd-upsert-1",
      success: true,
      metrics: { pass: 2 },
    });
    const rows = listSceneOutcomes("dep-gh-pilot-001", { limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.success).toBe(true);
    delete process.env.AGENT_DATA_DIR;
  });

  it("listSceneOutcomes dedupes duplicate command_id on read", () => {
    const dir = mkdtempSync(join(tmpdir(), "scene-list-dedup-"));
    process.env.AGENT_DATA_DIR = dir;
    clearSceneOutcomesForTest("dep-gh-pilot-001");
    const first = {
      deployment_id: "dep-gh-pilot-001",
      scene_skill_id: "night_ventilation_control" as const,
      command_id: "cmd-list-dup",
      success: false,
      metrics: { pass: 1 },
    };
    const second = {
      ...first,
      success: true,
      metrics: { pass: 2 },
    };
    appendSceneOutcome(first);
    appendSceneOutcome(second);
    const rows = listSceneOutcomes("dep-gh-pilot-001", { limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.success).toBe(true);
    expect(rows[0]?.metrics).toEqual({ pass: 2 });
    delete process.env.AGENT_DATA_DIR;
  });

  it("upsert dedupes duplicate command_id lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "scene-dedup-"));
    process.env.AGENT_DATA_DIR = dir;
    clearSceneOutcomesForTest("dep-gh-pilot-001");
    const dup = {
      deployment_id: "dep-gh-pilot-001",
      scene_skill_id: "night_ventilation_control" as const,
      command_id: "cmd-dup",
      success: false,
      metrics: {},
    };
    appendSceneOutcome(dup);
    appendSceneOutcome(dup);
    upsertSceneOutcomeByCommand({
      deployment_id: "dep-gh-pilot-001",
      scene_skill_id: "night_ventilation_control",
      command_id: "cmd-dup",
      success: true,
      metrics: {},
    });
    const rows = listSceneOutcomes("dep-gh-pilot-001", { limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.success).toBe(true);
    delete process.env.AGENT_DATA_DIR;
  });

  it("fails visibly on corrupt outcome lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "scene-corrupt-"));
    process.env.AGENT_DATA_DIR = dir;
    getMemoryJournal().writeOutcomeLines("dep-gh-pilot-001", ["{not-json"]);
    expect(() => listSceneOutcomes("dep-gh-pilot-001")).toThrow(
      /scene outcome line 无法读取或校验失败/,
    );
    expect(() =>
      upsertSceneOutcomeByCommand({
        deployment_id: "dep-gh-pilot-001",
        scene_skill_id: "night_ventilation_control",
        command_id: "cmd-corrupt",
        success: true,
        metrics: {},
      }),
    ).toThrow(/scene outcome line 无法读取或校验失败/);
    delete process.env.AGENT_DATA_DIR;
  });

  it("entity aggregation ignores deployment-level outcomes without entity id", () => {
    const dir = mkdtempSync(join(tmpdir(), "scene-agg-gh-"));
    process.env.AGENT_DATA_DIR = dir;
    clearSceneOutcomesForTest("dep-gh-pilot-001");
    appendSceneOutcome({
      deployment_id: "dep-gh-pilot-001",
      scene_skill_id: "night_ventilation_control",
      success: true,
      metrics: {},
    });
    appendSceneOutcome({
      deployment_id: "dep-gh-pilot-001",
      scene_skill_id: "night_ventilation_control",
      entity_id: "gh-001",
      success: true,
      metrics: {},
    });
    expect(aggregateSceneOutcomesByEntity("dep-gh-pilot-001", "night_ventilation_control")).toEqual(
      {
        "gh-001": { total: 1, success: 1 },
      },
    );
    delete process.env.AGENT_DATA_DIR;
  });
});
