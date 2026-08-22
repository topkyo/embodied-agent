import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendSceneOutcome, clearSceneOutcomesForTest } from "./outcome-store.js";
import { savePilotBaseline } from "./pilot-baseline.js";
import { buildPilotRoiSummary } from "./roi-report.js";

describe("roi-report", () => {
  it("estimates runs saved capped by baseline", () => {
    const dir = mkdtempSync(join(tmpdir(), "roi-"));
    process.env.AGENT_DATA_DIR = dir;
    clearSceneOutcomesForTest("dep-gh-pilot-001");
    savePilotBaseline("dep-gh-pilot-001", { manual_run_shed_count_per_week: 2 });
    appendSceneOutcome({
      deployment_id: "dep-gh-pilot-001",
      scene_skill_id: "night_ventilation_control",
      command_id: "c1",
      success: true,
      metrics: {},
    });
    appendSceneOutcome({
      deployment_id: "dep-gh-pilot-001",
      scene_skill_id: "night_ventilation_control",
      command_id: "c2",
      success: true,
      metrics: {},
    });
    appendSceneOutcome({
      deployment_id: "dep-gh-pilot-001",
      scene_skill_id: "night_ventilation_control",
      command_id: "c3",
      success: true,
      metrics: {},
    });
    const roi = buildPilotRoiSummary("dep-gh-pilot-001", 7);
    expect(roi.estimated_runs_saved).toBe(2);
    expect(roi.summary_text).toContain("跑棚");
    delete process.env.AGENT_DATA_DIR;
  });
});
