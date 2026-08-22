import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendAlertEvent,
  clearAlertEventsForTest,
  queryAlertEventsToday,
} from "./alert-events.js";

let testDir: string;

describe("alert-events", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    releaseAgentDataDir(testDir);
  });

  it("queries today using local farm timezone", () => {
    vi.setSystemTime(new Date("2026-06-06T16:10:00.000Z"));
    appendAlertEvent({
      deployment_id: "dep-gh-pilot-001",
      entity_id: "gh-001",
      event_type: "threshold",
      message: "test alert",
    });

    vi.setSystemTime(new Date("2026-06-07T00:30:00.000Z"));
    expect(queryAlertEventsToday("dep-gh-pilot-001")).toHaveLength(1);
    clearAlertEventsForTest("dep-gh-pilot-001");
  });
});
