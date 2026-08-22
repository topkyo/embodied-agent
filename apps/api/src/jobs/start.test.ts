import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";

const {
  evaluateSustainedAlerts,
  evaluateAndPushAlerts,
  evaluateNodeOfflineAlerts,
  tickStatusReportSchedules,
  tickOutcomeScheduler,
  hasActiveProactiveAlerts,
} = vi.hoisted(() => ({
  evaluateSustainedAlerts: vi.fn(async () => undefined),
  evaluateAndPushAlerts: vi.fn(async () => undefined),
  evaluateNodeOfflineAlerts: vi.fn(async () => undefined),
  tickStatusReportSchedules: vi.fn(async () => undefined),
  tickOutcomeScheduler: vi.fn(),
  hasActiveProactiveAlerts: vi.fn(() => true),
}));

vi.mock("../alerts/sustained-push.js", () => ({
  evaluateSustainedAlerts,
}));
vi.mock("../alerts/push.js", () => ({
  evaluateAndPushAlerts,
}));
vi.mock("../alerts/offline-push.js", () => ({
  evaluateNodeOfflineAlerts,
}));
vi.mock("../report/scheduler.js", () => ({
  tickStatusReportSchedules,
}));
vi.mock("../scene/outcome-scheduler.js", () => ({
  tickOutcomeScheduler,
}));
vi.mock("@embodied-agent/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@embodied-agent/runtime")>();
  return {
    ...actual,
    hasActiveProactiveAlerts,
  };
});
vi.mock("../settings/store.js", () => ({
  getEffectiveSettings: vi.fn(() => ({
    deployment_id: "dep-test-001",
    mqtt_url: "",
  })),
  clearEffectiveSettingsCacheForTest: vi.fn(),
}));

import { join } from "node:path";
import { alertPollLockPath, runAlertPollTick } from "./start.js";

let testDir: string;

describe("runAlertPollTick", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("jobs-start");
    vi.clearAllMocks();
    hasActiveProactiveAlerts.mockReturnValue(true);
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("runs alert evaluators under coordination lock", async () => {
    await runAlertPollTick();

    expect(evaluateSustainedAlerts).toHaveBeenCalledTimes(1);
    expect(evaluateAndPushAlerts).toHaveBeenCalledTimes(1);
    expect(evaluateNodeOfflineAlerts).toHaveBeenCalledTimes(1);
    expect(tickStatusReportSchedules).toHaveBeenCalledTimes(1);
    expect(tickOutcomeScheduler).toHaveBeenCalledWith(["dep-test-001"]);
  });

  it("resolves lock path under AGENT_DATA_DIR (not cwd)", () => {
    expect(alertPollLockPath()).toBe(join(testDir, "jobs", "alert-poll", "dep-test-001.lock"));
  });

  it("skips duplicate tick when lock is busy", async () => {
    evaluateAndPushAlerts.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
    );

    const first = runAlertPollTick();
    const second = runAlertPollTick();
    await Promise.all([first, second]);

    expect(evaluateAndPushAlerts).toHaveBeenCalledTimes(1);
  });
});
