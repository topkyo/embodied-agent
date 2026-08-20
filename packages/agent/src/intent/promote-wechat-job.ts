import { randomUUID } from "node:crypto";
import type { AgentRuntimeBindings } from "../runtime-bindings.js";
import {
  isWechatPromoteFromApiAllowed,
  promoteCasesToWechat,
  type PromoteWechatOptions,
  type PromoteWechatResult,
} from "./promote-wechat-runner.js";

export type PromoteJobStatus = "running" | "completed" | "failed";

export type PromoteWechatJob = {
  job_id: string;
  status: PromoteJobStatus;
  started_at: string;
  finished_at?: string;
  result?: PromoteWechatResult;
};

const jobs = new Map<string, PromoteWechatJob>();
let runningJobId: string | null = null;

const MAX_RETAINED_JOBS = 50;
const JOB_TTL_MS = 24 * 60 * 60 * 1000;

function evictOldJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status === "running") continue;
    const finished = job.finished_at ? Date.parse(job.finished_at) : NaN;
    if (Number.isFinite(finished) && now - finished > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
  const finishedIds = [...jobs.entries()]
    .filter(([, job]) => job.status !== "running")
    .sort((a, b) => {
      const at = Date.parse(a[1].finished_at ?? a[1].started_at);
      const bt = Date.parse(b[1].finished_at ?? b[1].started_at);
      return at - bt;
    })
    .map(([id]) => id);
  while (jobs.size > MAX_RETAINED_JOBS && finishedIds.length > 0) {
    const id = finishedIds.shift();
    if (id) jobs.delete(id);
  }
}

export function getPromoteWechatJob(jobId: string): PromoteWechatJob | undefined {
  return jobs.get(jobId);
}

export function resetPromoteWechatJobsForTest(): void {
  jobs.clear();
  runningJobId = null;
}

export type StartPromoteJobResult =
  { ok: true; job_id: string } | { ok: false; error: string; httpStatus: 409 | 501 };

export function startPromoteWechatJob(
  bindings: AgentRuntimeBindings,
  opts: Omit<PromoteWechatOptions, "fromApi"> = {},
): StartPromoteJobResult {
  if (!isWechatPromoteFromApiAllowed()) {
    return {
      ok: false,
      error:
        "wechat promote via API is disabled in this environment; set INTENT_PROMOTE_WECHAT_API=1 to enable, or use npm run intent:failures:promote-wechat",
      httpStatus: 501,
    };
  }
  if (runningJobId) {
    return { ok: false, error: "promote already in progress", httpStatus: 409 };
  }

  const job_id = randomUUID();
  const job: PromoteWechatJob = {
    job_id,
    status: "running",
    started_at: new Date().toISOString(),
  };
  jobs.set(job_id, job);
  runningJobId = job_id;
  evictOldJobs();

  void (async () => {
    try {
      const result = await promoteCasesToWechat(bindings, { ...opts, fromApi: true });
      job.result = result;
      job.status = result.ok ? "completed" : "failed";
    } catch (e) {
      job.result = {
        ok: false,
        promoted: 0,
        skipped: 0,
        failed: 0,
        results: [],
        error: e instanceof Error ? e.message : String(e),
      };
      job.status = "failed";
    } finally {
      job.finished_at = new Date().toISOString();
      if (runningJobId === job_id) runningJobId = null;
      evictOldJobs();
    }
  })();

  return { ok: true, job_id };
}
