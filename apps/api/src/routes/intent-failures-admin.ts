import type { FastifyInstance } from "fastify";
import { type FailureConfidence, type IntentFailureCase } from "@embodied-agent/agent";
import { isPromotableToWechat } from "@embodied-agent/agent";
import { getPromoteWechatJob } from "@embodied-agent/agent";
import { requireAdmin } from "./admin-auth.js";
import { getIntentResolver } from "../runtime/agent-context.js";

const RAW_PREVIEW_LEN = 200;
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;

export type IntentFailureListItem = {
  id: string;
  utterance: string;
  failure_kind: IntentFailureCase["failure_kind"];
  confidence: FailureConfidence;
  promoted: boolean;
  promote_dest?: IntentFailureCase["promote_dest"];
  platform?: string;
  flash_skill?: string;
  pro_skill?: string;
  expected_skill?: string;
  recorded_at: string;
  promotable: boolean;
  raw_response_preview: string;
};

function toListItem(row: IntentFailureCase): IntentFailureListItem {
  const raw = row.raw_response ?? "";
  const { bindings } = getIntentResolver();
  return {
    id: row.id,
    utterance: row.utterance,
    failure_kind: row.failure_kind,
    confidence: row.confidence,
    promoted: row.promoted,
    promote_dest: row.promote_dest,
    platform: row.platform,
    flash_skill: row.flash_skill,
    pro_skill: row.pro_skill,
    expected_skill: row.expected_skill,
    recorded_at: row.recorded_at,
    promotable: isPromotableToWechat(bindings, row),
    raw_response_preview: raw.length > RAW_PREVIEW_LEN ? `${raw.slice(0, RAW_PREVIEW_LEN)}…` : raw,
  };
}

function parseBoolQuery(value: unknown): { ok: true; value: boolean | undefined } | { ok: false } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === "true" || value === "1") return { ok: true, value: true };
  if (value === "false" || value === "0") return { ok: true, value: false };
  return { ok: false };
}

function parseLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_LIST_LIMIT;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.floor(n), MAX_LIST_LIMIT);
}

function startPromote(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  opts: { ids?: string[] },
): unknown {
  const resolver = getIntentResolver();
  if (opts.ids?.length) {
    const validation = resolver.validatePromoteRequest(opts.ids);
    if (!validation.ok) {
      return reply.status(validation.httpStatus).send({ error: validation.error });
    }
  }
  const started = resolver.startPromoteWechatJob(opts);
  if (!started.ok) {
    if (started.httpStatus === 501) {
      return reply.status(501).send({ error: started.error });
    }
    return reply.status(409).send({ error: started.error });
  }
  return reply.status(202).send({
    job_id: started.job_id,
    status: "running",
  });
}

export async function registerIntentFailuresAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      confidence?: FailureConfidence;
      promoted?: string;
      platform?: string;
      limit?: string;
    };
  }>("/admin/intent-failures", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    const promotedParsed = parseBoolQuery(request.query.promoted);
    if (!promotedParsed.ok) {
      return reply.status(400).send({ error: "invalid_promoted_query" });
    }

    let rows = getIntentResolver().loadIntentFailures();

    if (request.query.confidence) {
      rows = rows.filter((r) => r.confidence === request.query.confidence);
    }
    if (promotedParsed.value !== undefined) {
      rows = rows.filter((r) => r.promoted === promotedParsed.value);
    }
    if (request.query.platform?.trim()) {
      const p = request.query.platform.trim();
      rows = rows.filter((r) => r.platform === p);
    }

    rows.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
    const limit = parseLimit(request.query.limit);
    const total = rows.length;
    const cases = rows.slice(0, limit).map(toListItem);

    return { cases, total, limit };
  });

  app.get<{ Params: { jobId: string } }>(
    "/admin/intent-failures/promote-wechat/jobs/:jobId",
    async (request, reply) => {
      if (!requireAdmin(request)) {
        return reply.status(401).send({ error: "unauthorized" });
      }
      const jobId = request.params.jobId?.trim();
      if (!jobId) {
        return reply.status(400).send({ error: "missing_job_id" });
      }
      const job = getPromoteWechatJob(jobId);
      if (!job) {
        return reply.status(404).send({ error: "job_expired" });
      }
      if (job.status === "running") {
        return { job_id: job.job_id, status: job.status, started_at: job.started_at };
      }
      return {
        job_id: job.job_id,
        status: job.status,
        started_at: job.started_at,
        finished_at: job.finished_at,
        result: job.result,
      };
    },
  );

  app.post("/admin/intent-failures/promote-wechat", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return startPromote(reply, {});
  });

  app.post<{ Params: { id: string } }>(
    "/admin/intent-failures/:id/promote-wechat",
    async (request, reply) => {
      if (!requireAdmin(request)) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const id = request.params.id?.trim();
      if (!id) {
        return reply.status(400).send({ error: "missing_id" });
      }

      return startPromote(reply, { ids: [id] });
    },
  );
}
