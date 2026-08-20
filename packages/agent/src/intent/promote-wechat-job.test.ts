import { allocateAgentDataDir, releaseAgentDataDir } from "@embodied-agent/platform";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { bindTestAgentRuntime } from "../../test/bind-test-runtime.js";
import type { AgentRuntimeBindings } from "../runtime-bindings.js";
import { failuresPath } from "./failure-store.js";
import {
  getPromoteWechatJob,
  resetPromoteWechatJobsForTest,
  startPromoteWechatJob,
} from "./promote-wechat-job.js";

let testDir: string;
let matrixPath: string;
let bindings: AgentRuntimeBindings;

async function waitForJob(jobId: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = getPromoteWechatJob(jobId);
    if (job && job.status !== "running") return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`job ${jobId} did not finish`);
}

describe("promote-wechat-job", () => {
  beforeEach(() => {
    bindings = bindTestAgentRuntime();
    testDir = allocateAgentDataDir("promote-wechat-job");
    matrixPath = join(testDir, "matrix-wechat.jsonl");
    resetPromoteWechatJobsForTest();
    process.env.MATRIX_WECHAT_PATH_OVERRIDE = matrixPath;
    // API promote 默认拒绝，需显式开关；501 用例自行覆盖环境验证拒绝路径
    process.env.INTENT_PROMOTE_WECHAT_API = "1";
    writeFileSync(matrixPath, "", "utf8");
  });

  afterEach(() => {
    resetPromoteWechatJobsForTest();
    releaseAgentDataDir(testDir);
    delete process.env.MATRIX_WECHAT_PATH_OVERRIDE;
    delete process.env.INTENT_PROMOTE_WECHAT_API;
    delete process.env.VERCEL;
  });

  it("returns 501 by default without INTENT_PROMOTE_WECHAT_API", () => {
    delete process.env.INTENT_PROMOTE_WECHAT_API;
    const started = startPromoteWechatJob(bindings);
    expect(started.ok).toBe(false);
    if (!started.ok) expect(started.httpStatus).toBe(501);
  });

  it("returns 501 when API promote disabled", () => {
    process.env.VERCEL = "1";
    const started = startPromoteWechatJob(bindings);
    expect(started.ok).toBe(false);
    if (!started.ok) expect(started.httpStatus).toBe(501);
  });

  it("starts async job and completes with dry-run matrix inject", async () => {
    const row = {
      id: "f-job",
      utterance: "job 测试话术",
      raw_response: "",
      failure_kind: "verify_chat",
      confidence: "high",
      promoted: false,
      expected_skill: "irrigation.start",
      expected: { parameters: { duration_seconds: 300 } },
      recorded_at: "2026-06-08T12:00:00.000Z",
    };
    writeFileSync(failuresPath(bindings), `${JSON.stringify(row)}\n`, "utf8");

    const started = startPromoteWechatJob(bindings, {
      ids: ["f-job"],
      runMatrix: () => 0,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    await waitForJob(started.job_id);
    const job = getPromoteWechatJob(started.job_id);
    expect(job?.status).toBe("completed");
    expect(job?.result?.ok).toBe(true);
    expect(job?.result?.promoted).toBe(1);
  });

  it("rejects second job while first is running", () => {
    const first = startPromoteWechatJob(bindings, { dryRun: true });
    expect(first.ok).toBe(true);
    const second = startPromoteWechatJob(bindings, { dryRun: true });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.httpStatus).toBe(409);
  });
});
