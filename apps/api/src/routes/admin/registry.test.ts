import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { allocateAgentDataDir, releaseAgentDataDir } from "../../test/isolated-data-dir.js";
import { seedCanonicalSimRegistry } from "../../test/registry-fixture.js";
import { registerAdminRegistryRoutes } from "./registry.js";
import { loadRegistry } from "@embodied-agent/node";
import type { DeviceRegistry } from "@embodied-agent/core";

let testDir: string;
let app: FastifyInstance;
const adminHeaders = { "x-admin-token": "test-admin-token" };

describe("admin registry routes", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("admin-registry");
    seedCanonicalSimRegistry();
    process.env.ADMIN_TOKEN = "test-admin-token";
    app = Fastify({ logger: false });
    registerAdminRegistryRoutes(app);
  });

  afterEach(async () => {
    delete process.env.ADMIN_TOKEN;
    await app.close();
    releaseAgentDataDir(testDir);
  });

  it("GET /admin/registry without admin token returns 401", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/registry" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
  });

  it("GET /admin/registry with admin token returns the seeded registry", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/registry",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as DeviceRegistry;
    expect(body.deployments.length).toBeGreaterThan(0);
    expect(body.entities.length).toBeGreaterThan(0);
    expect(body.devices.length).toBeGreaterThan(0);
  });

  it("PUT /admin/registry with admin token and valid registry returns 200", async () => {
    const original = loadRegistry();
    const updated: DeviceRegistry = {
      ...original,
      deployments: [...original.deployments],
    };
    const res = await app.inject({
      method: "PUT",
      url: "/admin/registry",
      headers: adminHeaders,
      payload: updated,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; registry: DeviceRegistry };
    expect(body.ok).toBe(true);
    expect(body.registry.deployments).toEqual(updated.deployments);
  });

  it("PUT /admin/registry with invalid registry (missing deployments) returns 400", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/admin/registry",
      headers: adminHeaders,
      payload: { entities: [], devices: [] },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string };
    expect(body.error).toContain("deployments");
  });

  it("PUT /admin/registry with invalid registry (missing entities) returns 400", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/admin/registry",
      headers: adminHeaders,
      payload: { deployments: [], devices: [] },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string };
    expect(body.error).toContain("entities");
  });

  it("PUT /admin/registry with missing devices array returns 400", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/admin/registry",
      headers: adminHeaders,
      payload: { deployments: [], entities: [] },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string };
    expect(body.error).toContain("devices");
  });
});
