import { describe, it, expect } from "vitest";
import { selectBlockingIssue } from "./SceneOpsReadinessContext";
import type { PlatformReadiness } from "../api";

function baseReadiness(partial: Partial<PlatformReadiness> = {}): PlatformReadiness {
  return {
    ready: false,
    generated_at: "2026-01-01T00:00:00.000Z",
    deployment_id: "dep-1",
    active_domain: "agriculture",
    checks: [],
    packs: [],
    runtime_issues: [],
    reports: [],
    pending_confirms_count: 0,
    ...partial,
  };
}

describe("selectBlockingIssue", () => {
  it("returns null when no data", () => {
    expect(selectBlockingIssue(null)).toBeNull();
  });

  it("prefers error-severity failed check over warning", () => {
    const issue = selectBlockingIssue(
      baseReadiness({
        checks: [
          {
            id: "warn-check",
            label: "Warn",
            detail: "w",
            ok: false,
            severity: "warning",
          },
          {
            id: "mqtt_transport",
            label: "Transport",
            detail: "down",
            ok: false,
            severity: "error",
          },
        ],
      }),
    );
    expect(issue?.code).toBe("mqtt_transport");
    expect(issue?.severity).toBe("error");
  });

  it("falls back to runtime_issues when checks all ok", () => {
    const issue = selectBlockingIssue(
      baseReadiness({
        checks: [{ id: "ok", label: "OK", detail: "", ok: true, severity: "error" }],
        runtime_issues: [{ code: "sim_matrix", message: "stale", severity: "warning" }],
      }),
    );
    expect(issue?.code).toBe("sim_matrix");
    expect(issue?.severity).toBe("warning");
  });

  it("returns null when ready and no issues", () => {
    expect(
      selectBlockingIssue(
        baseReadiness({
          ready: true,
          checks: [{ id: "ok", label: "OK", detail: "", ok: true, severity: "error" }],
        }),
      ),
    ).toBeNull();
  });
});
