import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deploymentDataDir, deploymentScopedPath, ensureDeploymentDir } from "./deployment-path.js";

describe("deployment path helpers", () => {
  it("rejects empty or invalid deployment ids", () => {
    const root = mkdtempSync(join(tmpdir(), "deployment-path-"));

    expect(() => deploymentDataDir(root, "")).toThrow(/deployment_id/);
    expect(() => ensureDeploymentDir(root, "../dep")).toThrow(/deployment_id/);
  });

  it("rejects unsafe scoped filenames", () => {
    const root = mkdtempSync(join(tmpdir(), "deployment-path-"));

    expect(() => deploymentScopedPath(root, "dep-test", "../settings.json")).toThrow(/filename/);
    expect(() => deploymentScopedPath(root, "dep-test", "/tmp/out.json")).toThrow(/filename/);
  });

  it("builds deployment-scoped paths under deployments", () => {
    const root = mkdtempSync(join(tmpdir(), "deployment-path-"));

    expect(deploymentScopedPath(root, "dep-test", "intent-failures.jsonl")).toBe(
      join(root, "deployments", "dep-test", "intent-failures.jsonl"),
    );
  });
});
