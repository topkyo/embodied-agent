import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPilotBaseline, savePilotBaseline } from "./pilot-baseline.js";

describe("pilot-baseline", () => {
  it("merges patch without wiping existing fields", () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-base-"));
    process.env.AGENT_DATA_DIR = dir;
    savePilotBaseline("dep-gh-pilot-001", { manual_run_shed_count_per_week: 5 });
    const row = savePilotBaseline("dep-gh-pilot-001", { notes: "试点备注" });
    expect(row.manual_run_shed_count_per_week).toBe(5);
    expect(row.notes).toBe("试点备注");
    expect(getPilotBaseline("dep-gh-pilot-001")?.manual_run_shed_count_per_week).toBe(5);
    delete process.env.AGENT_DATA_DIR;
  });
});
