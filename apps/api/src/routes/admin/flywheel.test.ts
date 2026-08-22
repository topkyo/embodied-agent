import { allocateAgentDataDir, releaseAgentDataDir } from "../../test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { buildApp } from "../../app.js";
import { seedCanonicalSimRegistry } from "../../test/registry-fixture.js";

let testDir: string;
const adminHeaders = { "x-admin-token": "test-admin-token" };

describe("admin flywheel", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("flywheel");
    seedCanonicalSimRegistry();
    process.env.ADMIN_TOKEN = "test-admin-token";
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
    releaseAgentDataDir(testDir);
  });

  it("POST /admin/flywheel/trigger requires admin token", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/admin/flywheel/trigger" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("GET /admin/flywheel/status/:job_id requires admin token", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/admin/flywheel/status/nonexistent",
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("POST /admin/flywheel/trigger returns job_id and running status", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/admin/flywheel/trigger",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(202);
    const body = res.json() as { job_id: string; status: string };
    expect(body.job_id).toMatch(/^flywheel-\d+-\w+$/);
    expect(body.status).toBe("running");

    const statusRes = await app.inject({
      method: "GET",
      url: `/admin/flywheel/status/${body.job_id}`,
      headers: adminHeaders,
    });
    expect(statusRes.statusCode).toBe(200);
    const statusBody = statusRes.json() as {
      job_id: string;
      status: string;
      started_at: string;
    };
    expect(statusBody.job_id).toBe(body.job_id);
    expect(["running", "done", "failed"]).toContain(statusBody.status);
    expect(statusBody.started_at).toBeTruthy();
    await app.close();
  });

  it("GET /admin/flywheel/status/:job_id returns 404 for unknown job", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/admin/flywheel/status/nonexistent-job",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
