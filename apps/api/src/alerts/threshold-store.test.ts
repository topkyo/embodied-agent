import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { filterAlertRules, removeAlertRule, setAlertRule } from "./threshold-store.js";

let testDir: string;

describe("threshold-store", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    mkdirSync(resolve(testDir, "deployments", "dep-gh-pilot-001"), { recursive: true });
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("set → query → clear threshold flow", () => {
    setAlertRule({
      entity_id: "gh-001",
      metric: "temperature_c",
      operator: ">",
      value: 30,
      updated_by: "owner-001",
    });
    setAlertRule({
      entity_id: "gh-001",
      metric: "humidity_percent",
      operator: ">",
      value: 80,
      updated_by: "owner-001",
    });
    expect(filterAlertRules("gh-001")).toHaveLength(2);
    expect(removeAlertRule("gh-001", "temperature_c")).toBe(1);
    expect(filterAlertRules("gh-001")).toHaveLength(1);
    expect(removeAlertRule("gh-001")).toBe(1);
    expect(filterAlertRules("gh-001")).toHaveLength(0);
  });

  it("isolates rules per deployment_id", () => {
    mkdirSync(resolve(testDir, "deployments", "dep-test-002"), { recursive: true });
    setAlertRule(
      {
        entity_id: "gh-001",
        metric: "temperature_c",
        operator: ">",
        value: 30,
        updated_by: "owner-001",
      },
      "dep-gh-pilot-001",
    );
    setAlertRule(
      {
        entity_id: "gh-001",
        metric: "temperature_c",
        operator: ">",
        value: 28,
        updated_by: "owner-001",
      },
      "dep-test-002",
    );
    expect(filterAlertRules("gh-001", "dep-gh-pilot-001")[0]?.value).toBe(30);
    expect(filterAlertRules("gh-001", "dep-test-002")[0]?.value).toBe(28);
  });
});
