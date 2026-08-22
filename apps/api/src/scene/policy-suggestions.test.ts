import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendSceneOutcome, clearSceneOutcomesForTest } from "./outcome-store.js";
import {
  applyPolicySuggestion,
  clearPolicySuggestionsForTest,
  generatePolicySuggestions,
  listPolicySuggestions,
} from "./policy-suggestions.js";
import { setAlertRule, listAlertRules } from "../alerts/threshold-store.js";

describe("policy-suggestions", () => {
  it("generates per-greenhouse suggestion and applies to correct farm", () => {
    const dir = mkdtempSync(join(tmpdir(), "policy-"));
    process.env.AGENT_DATA_DIR = dir;
    clearSceneOutcomesForTest("dep-gh-pilot-001");
    clearPolicySuggestionsForTest("dep-gh-pilot-001");
    setAlertRule(
      {
        entity_id: "gh-001",
        metric: "temperature_c",
        operator: ">",
        value: 30,
        updated_by: "test",
      },
      "dep-gh-pilot-001",
    );
    for (let i = 0; i < 3; i++) {
      appendSceneOutcome({
        deployment_id: "dep-gh-pilot-001",
        scene_skill_id: "night_ventilation_control",
        command_id: `cmd-${i}`,
        entity_id: "gh-001",
        success: true,
        metrics: {},
      });
    }
    const created = generatePolicySuggestions("dep-gh-pilot-001");
    expect(created.length).toBeGreaterThan(0);
    const pending = listPolicySuggestions("dep-gh-pilot-001", "pending");
    const applied = applyPolicySuggestion("dep-gh-pilot-001", pending[0]!.id, "owner-001");
    expect(applied.ok).toBe(true);
    const rule = listAlertRules("dep-gh-pilot-001").find((r) => r.entity_id === "gh-001");
    expect(rule?.value).toBe(29);
    delete process.env.AGENT_DATA_DIR;
  });

  it("does not suggest when successes are on a different greenhouse", () => {
    const dir = mkdtempSync(join(tmpdir(), "policy-gh-"));
    process.env.AGENT_DATA_DIR = dir;
    clearSceneOutcomesForTest("dep-gh-pilot-001");
    clearPolicySuggestionsForTest("dep-gh-pilot-001");
    setAlertRule(
      {
        entity_id: "gh-002",
        metric: "temperature_c",
        operator: ">",
        value: 30,
        updated_by: "test",
      },
      "dep-gh-pilot-001",
    );
    for (let i = 0; i < 3; i++) {
      appendSceneOutcome({
        deployment_id: "dep-gh-pilot-001",
        scene_skill_id: "night_ventilation_control",
        command_id: `cmd-gh1-${i}`,
        entity_id: "gh-001",
        success: true,
        metrics: {},
      });
    }
    const created = generatePolicySuggestions("dep-gh-pilot-001");
    expect(created).toHaveLength(0);
    delete process.env.AGENT_DATA_DIR;
  });
});
