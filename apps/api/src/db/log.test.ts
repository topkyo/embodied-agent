import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appendOperationLog, clearOperationLogs, queryLogsToday } from "./log.js";

let testDir: string;

describe("operation log", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    clearOperationLogs();
    releaseAgentDataDir(testDir);
  });

  it("queries today using local deployment timezone and entity_id", () => {
    vi.setSystemTime(new Date("2026-06-06T16:10:00.000Z"));
    appendOperationLog({
      user_id: "owner-001",
      skill: "log.query_today",
      intent_source: "llm",
      model: "test",
      params: { entity_id: "gh-001", intent_id: "intent-001" },
      result: "completed",
      message: "test log",
    });

    vi.setSystemTime(new Date("2026-06-07T00:30:00.000Z"));
    expect(queryLogsToday("dep-gh-pilot-001", "gh-001")).toHaveLength(1);
  });
});
