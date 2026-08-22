import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAgentDataDir } from "@embodied-agent/platform";
import { dataRoot, deploymentDir } from "./deployment-path.js";

describe("deployment-path", () => {
  it("delegates dataRoot to resolveAgentDataDir", () => {
    expect(dataRoot()).toBe(resolveAgentDataDir());
  });

  it("scopes data under deployments/", () => {
    const root = dataRoot();
    expect(deploymentDir("dep-gh-pilot-001")).toBe(
      resolve(root, "deployments", "dep-gh-pilot-001"),
    );
  });
});
