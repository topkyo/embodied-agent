import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bindTestAgentRuntime } from "../../test/bind-test-runtime.js";
import {
  loadIntentFailures,
  recordIntentFailureUnified,
  markFailurePromoted,
  upsertIntentFailureCase,
} from "./failure-store.js";

describe("failure-store", () => {
  let testDir: string;
  let bindings: ReturnType<typeof bindTestAgentRuntime>;

  beforeEach(() => {
    testDir = mkdtempSync(resolve(tmpdir(), "intent-fail-"));
    process.env.AGENT_DATA_DIR = testDir;
    process.env.NODE_ENV = "development";
    bindings = bindTestAgentRuntime();
  });

  afterEach(() => {
    delete process.env.AGENT_DATA_DIR;
    process.env.NODE_ENV = "test";
    rmSync(testDir, { recursive: true, force: true });
  });

  it("records and dedupes failures", () => {
    recordIntentFailureUnified(bindings, {
      utterance: "2号棚报警",
      raw_response: "{}",
      error: "zod",
    });
    recordIntentFailureUnified(bindings, {
      utterance: "2号棚报警",
      raw_response: "{}",
      error: "zod",
    });
    expect(loadIntentFailures(bindings)).toHaveLength(1);
    expect(loadIntentFailures(bindings)[0]?.failure_kind).toBe("schema_failed");
    expect(
      existsSync(join(testDir, "deployments", "dep-gh-pilot-001", "intent-failures.jsonl")),
    ).toBe(true);
    expect(existsSync(join(testDir, "intent-failures.jsonl"))).toBe(false);
  });

  it("marks promoted with dest", () => {
    recordIntentFailureUnified(bindings, {
      utterance: "test phrase",
      raw_response: "{}",
    });
    const id = loadIntentFailures(bindings)[0]!.id;
    markFailurePromoted(bindings, id, "wechat");
    const row = loadIntentFailures(bindings)[0];
    expect(row?.promoted).toBe(true);
    expect(row?.promote_dest).toBe("wechat");
  });

  it("upserts high-confidence case fields", () => {
    upsertIntentFailureCase(bindings, {
      utterance: "开启灌溉不是通风",
      raw_response: "",
      failure_kind: "user_correction",
      confidence: "high",
      pro_intent: {
        skill: "irrigation.start",
        target: { greenhouse_id: "gh-002" },
        parameters: { duration_seconds: 900 },
      },
      platform: "wechat",
    });
    upsertIntentFailureCase(bindings, {
      utterance: "开启灌溉不是通风",
      raw_response: "",
      failure_kind: "user_correction",
      confidence: "high",
      history: [{ role: "user", content: "2号棚A区开启灌溉15分钟" }],
      platform: "wechat",
    });
    const rows = loadIntentFailures(bindings);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.history).toHaveLength(1);
    expect(rows[0]?.pro_intent?.skill).toBe("irrigation.start");
  });

  it("keeps promoted terminal state when the same utterance fails again", () => {
    recordIntentFailureUnified(bindings, {
      utterance: "重复失败话术",
      raw_response: "{}",
      error: "schema_failed",
    });
    const id = loadIntentFailures(bindings)[0]!.id;
    markFailurePromoted(bindings, id, "golden");
    recordIntentFailureUnified(bindings, {
      utterance: "重复失败话术",
      raw_response: '{"skill":"x"}',
      error: "schema_failed",
    });
    const row = loadIntentFailures(bindings)[0];
    expect(row?.promoted).toBe(true);
    expect(row?.promote_dest).toBe("golden");
  });

  it("merge retains flash_skill when follow-up upsert adds history only", () => {
    upsertIntentFailureCase(bindings, {
      utterance: "2号棚B区浇水8分钟",
      raw_response: "",
      failure_kind: "skill_mismatch",
      confidence: "high",
      flash_skill: "greenhouse.open_vent",
      pro_skill: "irrigation.start",
      pro_intent: {
        skill: "irrigation.start",
        target: { zone_id: "zone-b" },
        parameters: { duration_seconds: 480 },
      },
    });
    upsertIntentFailureCase(bindings, {
      utterance: "2号棚B区浇水8分钟",
      raw_response: "",
      failure_kind: "skill_mismatch",
      confidence: "high",
      history: [{ role: "user", content: "上一轮" }],
    });
    const row = loadIntentFailures(bindings)[0];
    expect(row?.flash_skill).toBe("greenhouse.open_vent");
    expect(row?.pro_intent?.skill).toBe("irrigation.start");
    expect(row?.history).toHaveLength(1);
  });
});
