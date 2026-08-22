import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { captureFailureCaseFromChat } from "./failure-case-capture.js";
import { loadIntentFailures } from "./failure-store.js";
import { bindTestAgentRuntime } from "../../test/bind-test-runtime.js";
import type { AgentRuntimeBindings } from "../runtime-bindings.js";

describe("failure-case-capture", () => {
  let testDir: string;
  let bindings: AgentRuntimeBindings;

  beforeEach(() => {
    testDir = mkdtempSync(resolve(tmpdir(), "intent-capture-"));
    process.env.AGENT_DATA_DIR = testDir;
    process.env.NODE_ENV = "development";
    bindings = bindTestAgentRuntime();
  });

  afterEach(() => {
    delete process.env.AGENT_DATA_DIR;
    process.env.NODE_ENV = "test";
    rmSync(testDir, { recursive: true, force: true });
  });

  const baseMsg = {
    platform: "wechat" as const,
    user_id: "owner-001",
    conversation_id: "wx-1",
    text: "浇水是灌溉不是开帘",
    timestamp: new Date().toISOString(),
  };

  it("does not capture user_correction without Pro escalation", () => {
    captureFailureCaseFromChat(bindings, {
      msg: baseMsg,
      deployment_id: "dep-gh-pilot-001",
      model: "deepseek-v4-pro",
      forcePro: true,
      history: [],
      result: {
        ok: true,
        validation: {
          kind: "intent",
          intent: {
            skill: "irrigation.start",
            target: { zone_id: "zone-b" },
            parameters: { duration_seconds: 480 },
            confidence: 0.9,
          },
        },
      },
      meta: { escalated: false, flash_skill: "irrigation.start" },
    });
    expect(loadIntentFailures(bindings)).toHaveLength(0);
  });

  it("captures user_correction after Pro escalation", () => {
    captureFailureCaseFromChat(bindings, {
      msg: baseMsg,
      deployment_id: "dep-gh-pilot-001",
      model: "deepseek-v4-flash",
      forcePro: true,
      history: [
        { role: "user", content: "2号棚B区浇水8分钟" },
        { role: "assistant", content: "将执行通风" },
      ],
      result: {
        ok: true,
        validation: {
          kind: "intent",
          intent: {
            skill: "irrigation.start",
            target: { zone_id: "zone-b" },
            parameters: { duration_seconds: 480 },
            confidence: 0.95,
          },
        },
      },
      meta: {
        escalated: true,
        escalation_reason: "user_correction",
        pro_intent: {
          skill: "irrigation.start",
          target: { zone_id: "zone-b" },
          parameters: { duration_seconds: 480 },
        },
      },
    });
    const rows = loadIntentFailures(bindings);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.failure_kind).toBe("user_correction");
    expect(rows[0]?.confidence).toBe("high");
    expect(rows[0]?.pro_intent?.skill).toBe("irrigation.start");
  });

  it("captures skill_mismatch when Pro fixes conflict", () => {
    captureFailureCaseFromChat(bindings, {
      msg: { ...baseMsg, text: "2号棚B区浇水8分钟" },
      deployment_id: "dep-gh-pilot-001",
      model: "deepseek-v4-flash",
      forcePro: false,
      history: [],
      result: {
        ok: true,
        validation: {
          kind: "intent",
          intent: {
            skill: "irrigation.start",
            target: { zone_id: "zone-b" },
            parameters: { duration_seconds: 480 },
            confidence: 0.95,
          },
        },
      },
      meta: {
        escalated: true,
        escalation_reason: "skill_utterance_conflict",
        flash_skill: "greenhouse.open_vent",
        pro_intent: {
          skill: "irrigation.start",
          target: { zone_id: "zone-b" },
          parameters: { duration_seconds: 480 },
        },
      },
    });
    const row = loadIntentFailures(bindings)[0];
    expect(row?.failure_kind).toBe("skill_mismatch");
    expect(row?.flash_skill).toBe("greenhouse.open_vent");
  });

  it("captures medium skill_mismatch when escalation skipped", () => {
    captureFailureCaseFromChat(bindings, {
      msg: { ...baseMsg, text: "2号棚B区浇水8分钟" },
      deployment_id: "dep-gh-pilot-001",
      model: "deepseek-v4-pro",
      forcePro: false,
      history: [],
      result: {
        ok: true,
        validation: {
          kind: "intent",
          intent: {
            skill: "greenhouse.open_vent",
            target: { greenhouse_id: "gh-002" },
            parameters: { duration_seconds: 480 },
            confidence: 0.9,
          },
        },
      },
      meta: {
        escalated: false,
        flash_skill: "greenhouse.open_vent",
      },
    });
    const row = loadIntentFailures(bindings)[0];
    expect(row?.failure_kind).toBe("skill_mismatch");
    expect(row?.confidence).toBe("medium");
    expect(row?.flash_skill).toBe("greenhouse.open_vent");
  });
});
