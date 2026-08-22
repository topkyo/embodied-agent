import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { IntentPayload } from "@embodied-agent/core";
import { getIntentResolver } from "../../runtime/agent-context.js";
import { runSafetyRejectionRoute } from "./pre-dispatch.js";

const openIntent: IntentPayload = {
  skill: "greenhouse.open_vent",
  target: { greenhouse_id: "gh-001" },
  parameters: { duration_seconds: 300 },
};

describe("pre-dispatch safety reject flywheel", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(resolve(tmpdir(), "pre-dispatch-"));
    process.env.AGENT_DATA_DIR = testDir;
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    delete process.env.AGENT_DATA_DIR;
    process.env.NODE_ENV = "test";
    rmSync(testDir, { recursive: true, force: true });
  });

  it("records safety_reject when utterance is present", () => {
    const result = runSafetyRejectionRoute(
      openIntent,
      {
        user_id: "worker-001",
        role: "worker",
        model: "mock",
        utterance: "把1号棚打开5分钟",
        conversation_id: "conv-1",
        platform: "wechat",
      },
      {
        allowed: false,
        reason: "工人账号不能执行通风控制。",
        requires_confirmation: false,
      },
    );

    expect(result.type).toBe("reply");
    if (result.type === "reply") {
      expect(result.status).toBe(403);
    }
    const failures = getIntentResolver().loadIntentFailures();
    expect(failures).toHaveLength(1);
    expect(failures[0]?.failure_kind).toBe("safety_reject");
    expect(failures[0]?.utterance).toBe("把1号棚打开5分钟");
    expect(failures[0]?.expected_skill).toBe("greenhouse.open_vent");
    expect(failures[0]?.error).toContain("工人");
  });

  it("skips flywheel capture without utterance", () => {
    runSafetyRejectionRoute(
      openIntent,
      {
        user_id: "worker-001",
        role: "worker",
        model: "mock",
      },
      {
        allowed: false,
        reason: "工人账号不能执行通风控制。",
        requires_confirmation: false,
      },
    );
    expect(getIntentResolver().loadIntentFailures()).toHaveLength(0);
  });
});
