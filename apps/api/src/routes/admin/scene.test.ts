import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { allocateAgentDataDir, releaseAgentDataDir } from "../../test/isolated-data-dir.js";
import { seedCanonicalSimRegistry } from "../../test/registry-fixture.js";
import { registerAdminSceneRoutes } from "./scene.js";
import { clearPolicySuggestionsForTest } from "../../scene/policy-suggestions.js";

// Mock roi-report and policy-suggestions to avoid PlatformRuntimeContext dependency.
vi.mock("../../scene/roi-report.js", () => ({
  buildPilotRoiSummary: () => ({
    deployment_id: "dep-gh-pilot-001",
    scene_total: 0,
    scene_success_count: 0,
    estimated_runs_saved: 0,
    summary_text: "暂无 ROI 数据",
  }),
}));
vi.mock("../../scene/policy-suggestions.js", () => ({
  generatePolicySuggestions: () => undefined,
  listPolicySuggestions: () => [],
  applyPolicySuggestion: () => ({ ok: false, error: "策略建议不存在" }),
  dismissPolicySuggestion: () => null,
  clearPolicySuggestionsForTest: () => undefined,
}));

import { clearSceneOutcomesForTest } from "../../scene/outcome-store.js";

let testDir: string;
let app: FastifyInstance;
const adminHeaders = { "x-admin-token": "test-admin-token" };

describe("admin scene routes", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("admin-scene");
    seedCanonicalSimRegistry();
    process.env.ADMIN_TOKEN = "test-admin-token";
    app = Fastify({ logger: false });
    registerAdminSceneRoutes(app);
  });

  afterEach(async () => {
    delete process.env.ADMIN_TOKEN;
    await app.close();
    releaseAgentDataDir(testDir);
  });

  it("GET /admin/scene-outcomes/all without admin token returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/scene-outcomes/all",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
  });

  it("GET /admin/scene-outcomes/all with admin token returns aggregation", async () => {
    clearSceneOutcomesForTest("dep-gh-pilot-001");
    const res = await app.inject({
      method: "GET",
      url: "/admin/scene-outcomes/all",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      deployments: Record<string, unknown>;
      total: number;
      success_count: number;
    };
    expect(body.total).toBe(0);
    expect(body.success_count).toBe(0);
    expect(body.deployments).toHaveProperty("dep-gh-pilot-001");
  });

  it("GET /admin/pilot/roi without admin token returns 401", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/pilot/roi" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /admin/pilot/roi with admin token returns ROI summary", async () => {
    clearSceneOutcomesForTest("dep-gh-pilot-001");
    const res = await app.inject({
      method: "GET",
      url: "/admin/pilot/roi",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      deployment_id: string;
      scene_total: number;
      scene_success_count: number;
      estimated_runs_saved: number;
      summary_text: string;
    };
    expect(body.deployment_id).toBe("dep-gh-pilot-001");
    expect(body.scene_total).toBe(0);
  });

  it("GET /admin/policy-suggestions without admin token returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/policy-suggestions",
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /admin/policy-suggestions with admin token returns suggestions list", async () => {
    clearPolicySuggestionsForTest("dep-gh-pilot-001");
    const res = await app.inject({
      method: "GET",
      url: "/admin/policy-suggestions",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      deployment_id: string;
      suggestions: unknown[];
    };
    expect(body.deployment_id).toBe("dep-gh-pilot-001");
    expect(Array.isArray(body.suggestions)).toBe(true);
  });

  it("POST /admin/policy-suggestions/:id/apply on non-existent id returns 400", async () => {
    clearPolicySuggestionsForTest("dep-gh-pilot-001");
    const res = await app.inject({
      method: "POST",
      url: "/admin/policy-suggestions/nonexistent-id/apply",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string };
    expect(body.error).toContain("不存在");
  });

  it("POST /admin/policy-suggestions/:id/apply without admin token returns 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/policy-suggestions/some-id/apply",
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /admin/policy-suggestions/:id/dismiss on non-existent id returns 404", async () => {
    clearPolicySuggestionsForTest("dep-gh-pilot-001");
    const res = await app.inject({
      method: "POST",
      url: "/admin/policy-suggestions/nonexistent-id/dismiss",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });

  it("POST /admin/policy-suggestions/:id/dismiss without admin token returns 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/policy-suggestions/some-id/dismiss",
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /admin/scene-outcomes with admin token returns outcomes list", async () => {
    clearSceneOutcomesForTest("dep-gh-pilot-001");
    const res = await app.inject({
      method: "GET",
      url: "/admin/scene-outcomes",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      deployment_id: string;
      outcomes: unknown[];
    };
    expect(body.deployment_id).toBe("dep-gh-pilot-001");
    expect(Array.isArray(body.outcomes)).toBe(true);
  });

  it("GET /admin/pilot/baseline without admin token returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/pilot/baseline",
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /admin/pilot/baseline with admin token returns null when not set", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/pilot/baseline",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      deployment_id: string;
      baseline: unknown;
    };
    expect(body.deployment_id).toBe("dep-gh-pilot-001");
    expect(body.baseline).toBeNull();
  });

  it("POST /admin/pilot/baseline with admin token saves and returns baseline", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/pilot/baseline",
      headers: adminHeaders,
      payload: {
        manual_run_shed_count_per_week: 14,
        notes: "测试基线",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      baseline: {
        deployment_id: string;
        manual_run_shed_count_per_week: number;
        notes: string;
        updated_at: string;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.baseline.deployment_id).toBe("dep-gh-pilot-001");
    expect(body.baseline.manual_run_shed_count_per_week).toBe(14);
    expect(body.baseline.notes).toBe("测试基线");
    expect(body.baseline.updated_at).toBeTruthy();

    const getRes = await app.inject({
      method: "GET",
      url: "/admin/pilot/baseline",
      headers: adminHeaders,
    });
    const getBody = getRes.json() as { baseline: { manual_run_shed_count_per_week: number } };
    expect(getBody.baseline.manual_run_shed_count_per_week).toBe(14);
  });

  it("POST /admin/pilot/baseline without admin token returns 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/pilot/baseline",
      payload: { manual_run_shed_count_per_week: 10 },
    });
    expect(res.statusCode).toBe(401);
  });
});
