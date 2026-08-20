import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { createMqttContext, type MqttContext } from "@embodied-agent/node";
import { allocateAgentDataDir, releaseAgentDataDir } from "../../test/isolated-data-dir.js";
import { seedCanonicalSimRegistry } from "../../test/registry-fixture.js";

// Mock loader and runtime context to avoid PlatformRuntimeContext dependency.
vi.mock("../../runtime/context.js", () => ({
  getPlatformRuntimeContext: () => ({
    loader: { load: () => null },
    bindings: {},
    services: {},
  }),
}));
vi.mock("../../domain-packs/loader.js", () => ({
  getDomainPackCatalog: () => [
    { id: "agriculture", displayName: "农场工长", webSlug: "greenhouse", status: "live" },
    { id: "robotics", displayName: "机器人领域", webSlug: "robot", status: "live" },
    { id: "industrial", displayName: "工业安能卫士", webSlug: "industrial", status: "live" },
  ],
  resolveActiveDomainPackContracts: () => [],
}));

import { registerAdminDomainPacksRoutes } from "./domain-packs.js";

declare module "fastify" {
  interface FastifyInstance {
    mqtt: MqttContext;
  }
}

let testDir: string;
let app: FastifyInstance;
const adminHeaders = { "x-admin-token": "test-admin-token" };

describe("admin domain-packs routes", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("admin-domain-packs");
    seedCanonicalSimRegistry();
    process.env.ADMIN_TOKEN = "test-admin-token";
    app = Fastify({ logger: false });
    app.decorate("mqtt", createMqttContext());
    registerAdminDomainPacksRoutes(app);
  });

  afterEach(async () => {
    delete process.env.ADMIN_TOKEN;
    await app.close();
    releaseAgentDataDir(testDir);
  });

  it("GET /admin/domain-packs without admin token returns 401", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/domain-packs" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
  });

  it("GET /admin/domain-packs with admin token returns catalog", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/domain-packs",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      catalog: Array<{
        id: string;
        display_name: string;
        web_slug: string;
        status: string;
        active: boolean;
      }>;
      active_domain: string;
      deployment_id: string;
    };
    expect(body.active_domain).toBe("agriculture");
    expect(body.deployment_id).toBe("dep-gh-pilot-001");
    expect(Array.isArray(body.catalog)).toBe(true);
    expect(body.catalog.length).toBeGreaterThan(0);
    const agriculture = body.catalog.find((e) => e.id === "agriculture");
    expect(agriculture).toBeDefined();
    expect(agriculture!.active).toBe(true);
  });

  it("GET /admin/platform/readiness without auth returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/platform/readiness",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
  });

  it("GET /admin/platform/readiness with admin token returns readiness checks", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/platform/readiness",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ready: boolean;
      generated_at: string;
      deployment_id: string;
      active_domain: string;
      checks: Array<{
        id: string;
        ok: boolean;
        label: string;
        detail: string;
        severity: string;
      }>;
    };
    expect(body.deployment_id).toBe("dep-gh-pilot-001");
    expect(body.active_domain).toBe("agriculture");
    expect(body.generated_at).toBeTruthy();
    expect(Array.isArray(body.checks)).toBe(true);
    expect(body.checks.length).toBeGreaterThan(0);
    const checkIds = body.checks.map((c) => c.id);
    expect(checkIds).toContain("active_domain");
    expect(checkIds).toContain("llm");
    expect(checkIds).toContain("registry");
  });
});
