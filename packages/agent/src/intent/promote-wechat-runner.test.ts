import { allocateAgentDataDir, releaseAgentDataDir } from "@embodied-agent/platform";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bindTestAgentRuntime } from "../../test/bind-test-runtime.js";
import type { AgentRuntimeBindings } from "../runtime-bindings.js";
import { failuresPath, loadIntentFailures } from "./failure-store.js";
import { isWechatPromoteFromApiAllowed, promoteCasesToWechat } from "./promote-wechat-runner.js";

let testDir: string;
let matrixPath: string;
let lockPath: string;
let bindings: AgentRuntimeBindings;

function writePromotableCase(id = "f-runner-test"): void {
  const row = {
    id,
    utterance: `晋升测试话术-${id}`,
    raw_response: "",
    failure_kind: "verify_chat",
    confidence: "high",
    promoted: false,
    expected_skill: "irrigation.start",
    expected: { parameters: { duration_seconds: 300 } },
    recorded_at: "2026-06-08T12:00:00.000Z",
  };
  writeFileSync(failuresPath(bindings), `${JSON.stringify(row)}\n`, "utf8");
}

describe("promote-wechat-runner", () => {
  beforeEach(() => {
    bindings = bindTestAgentRuntime();
    testDir = allocateAgentDataDir("promote-wechat-runner");
    matrixPath = join(testDir, "matrix-wechat.jsonl");
    lockPath = join(testDir, "intent-promote-wechat.lock");
    process.env.MATRIX_WECHAT_PATH_OVERRIDE = matrixPath;
    writeFileSync(matrixPath, "", "utf8");
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
    delete process.env.MATRIX_WECHAT_PATH_OVERRIDE;
    delete process.env.VERCEL;
    delete process.env.INTENT_PROMOTE_WECHAT_API;
    delete process.env.INTENT_PROMOTE_WECHAT_ALLOW_SERVERLESS;
  });

  it("promotes case and marks inbox when matrix passes", async () => {
    writePromotableCase();
    const result = await promoteCasesToWechat(bindings, {
      ids: ["f-runner-test"],
      runMatrix: () => 0,
    });
    expect(result.ok).toBe(true);
    expect(result.promoted).toBe(1);

    const inbox = loadIntentFailures(bindings).find((r) => r.id === "f-runner-test");
    expect(inbox?.promoted).toBe(true);
    expect(inbox?.promote_dest).toBe("wechat");

    const matrix = readFileSync(matrixPath, "utf8").trim().split("\n");
    expect(matrix).toHaveLength(1);
    expect(matrix[0]).toContain("晋升测试话术");
  });

  it("discards staging when sim fails without touching matrix", async () => {
    writePromotableCase();
    writeFileSync(matrixPath, '{"utterance":"existing","expected_skill":"x"}\n', "utf8");
    const result = await promoteCasesToWechat(bindings, {
      ids: ["f-runner-test"],
      runMatrix: () => 1,
    });
    expect(result.ok).toBe(false);
    expect(result.failed).toBe(1);
    expect(readFileSync(matrixPath, "utf8").trim()).toBe(
      '{"utterance":"existing","expected_skill":"x"}',
    );

    const inbox = loadIntentFailures(bindings).find((r) => r.id === "f-runner-test");
    expect(inbox?.promoted).toBe(false);
  });

  it("rejects concurrent promote while lock is held", async () => {
    writePromotableCase();
    writeFileSync(
      lockPath,
      `${JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() })}\n`,
      "utf8",
    );
    try {
      const result = await promoteCasesToWechat(bindings, { runMatrix: () => 0 });
      expect(result.ok).toBe(false);
      expect(result.error).toBe("promote already in progress");
    } finally {
      try {
        rmSync(lockPath);
      } catch {
        /* lock removed */
      }
    }
  });

  it("denies API promote by default on non-serverless without explicit env", async () => {
    expect(isWechatPromoteFromApiAllowed()).toBe(false);
    const result = await promoteCasesToWechat(bindings, { fromApi: true });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("disabled in this environment");

    process.env.INTENT_PROMOTE_WECHAT_API = "1";
    expect(isWechatPromoteFromApiAllowed()).toBe(true);
  });

  it("blocks API promote on Vercel unless both flags enabled", async () => {
    process.env.VERCEL = "1";
    expect(isWechatPromoteFromApiAllowed()).toBe(false);
    const result = await promoteCasesToWechat(bindings, { fromApi: true });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("disabled in this environment");

    process.env.INTENT_PROMOTE_WECHAT_API = "1";
    expect(isWechatPromoteFromApiAllowed()).toBe(false);

    process.env.INTENT_PROMOTE_WECHAT_ALLOW_SERVERLESS = "1";
    expect(isWechatPromoteFromApiAllowed()).toBe(true);
  });
});
