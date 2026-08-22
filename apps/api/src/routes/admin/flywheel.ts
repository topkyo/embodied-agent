import type { FastifyInstance } from "fastify";
import { createLogger } from "@embodied-agent/platform";
import { getEffectiveSettings } from "../../settings/store.js";
import { getPrimaryDomainPackContract } from "../../domain-packs/loader.js";
import { requireAdmin } from "../admin-auth.js";
import { getPlatformRuntimeContext } from "../../runtime/context.js";

const log = createLogger("admin.flywheel");

type FlywheelJobStatus = "running" | "done" | "failed";

type FlywheelJob = {
  id: string;
  status: FlywheelJobStatus;
  started_at: string;
  finished_at?: string;
  error?: string;
  adapter_module: string;
};

type DomainFlywheelAdapter = {
  runDomainFlywheel?: (args?: string[]) => Promise<void> | void;
};

const jobs = new Map<string, FlywheelJob>();

async function runFlywheelJob(jobId: string, adapterModule: string): Promise<void> {
  try {
    const adapter = (await import(adapterModule)) as DomainFlywheelAdapter;
    if (typeof adapter.runDomainFlywheel !== "function") {
      throw new Error(`${adapterModule} 未导出 runDomainFlywheel()`);
    }
    await adapter.runDomainFlywheel();
    jobs.set(jobId, {
      ...jobs.get(jobId)!,
      status: "done",
      finished_at: new Date().toISOString(),
    });
  } catch (e) {
    jobs.set(jobId, {
      ...jobs.get(jobId)!,
      status: "failed",
      finished_at: new Date().toISOString(),
      error: e instanceof Error ? e.message : String(e),
    });
    log.error("flywheel job failed", {
      job_id: jobId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export function registerAdminFlywheelRoutes(app: FastifyInstance): void {
  app.post("/admin/flywheel/trigger", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const settings = getEffectiveSettings();
    const contract = getPrimaryDomainPackContract(getPlatformRuntimeContext().loader, settings);
    const gate = contract.core.readiness?.flywheelGate;
    const adapterModule = gate?.adapterModule.trim();
    if (!adapterModule) {
      return reply.status(400).send({ error: "no_flywheel_gate" });
    }
    const jobId = `flywheel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    jobs.set(jobId, {
      id: jobId,
      status: "running",
      started_at: new Date().toISOString(),
      adapter_module: adapterModule,
    });
    void runFlywheelJob(jobId, adapterModule);
    return reply.status(202).send({ job_id: jobId, status: "running" });
  });

  app.get<{ Params: { job_id: string } }>(
    "/admin/flywheel/status/:job_id",
    async (request, reply) => {
      if (!requireAdmin(request)) {
        return reply.status(401).send({ error: "unauthorized" });
      }
      const job = jobs.get(request.params.job_id);
      if (!job) {
        return reply.status(404).send({ error: "job_not_found" });
      }
      return {
        job_id: job.id,
        status: job.status,
        started_at: job.started_at,
        finished_at: job.finished_at,
        error: job.error,
      };
    },
  );
}
