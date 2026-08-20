import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { allocateAgentDataDir, releaseAgentDataDir } from "../../test/isolated-data-dir.js";
import { seedCanonicalSimRegistry } from "../../test/registry-fixture.js";
import { registerAdminOperationsRoutes } from "./operations.js";
import { clearCommands } from "../../commands/store.js";

let testDir: string;
let app: FastifyInstance;
const adminHeaders = { "x-admin-token": "test-admin-token" };

describe("admin operations routes", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("admin-operations");
    seedCanonicalSimRegistry();
    process.env.ADMIN_TOKEN = "test-admin-token";
    app = Fastify({ logger: false });
    registerAdminOperationsRoutes(app);
  });

  afterEach(async () => {
    delete process.env.ADMIN_TOKEN;
    await app.close();
    releaseAgentDataDir(testDir);
  });

  it("GET /admin/commands without auth returns 401", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/commands" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
  });

  it("GET /admin/commands with admin token returns command list", async () => {
    clearCommands("dep-gh-pilot-001");
    const res = await app.inject({
      method: "GET",
      url: "/admin/commands",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { commands: unknown[]; count: number };
    expect(Array.isArray(body.commands)).toBe(true);
    expect(body.count).toBe(body.commands.length);
  });

  it("GET /admin/commands with limit query respects limit cap", async () => {
    clearCommands("dep-gh-pilot-001");
    const res = await app.inject({
      method: "GET",
      url: "/admin/commands?limit=5",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { commands: unknown[]; count: number };
    expect(body.commands.length).toBeLessThanOrEqual(5);
  });

  it("GET /admin/alert-rules without auth returns 401", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/alert-rules" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /admin/alert-rules with admin token returns rules list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/alert-rules",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      deployment_id: string;
      rules: unknown[];
      count: number;
    };
    expect(body.deployment_id).toBe("dep-gh-pilot-001");
    expect(Array.isArray(body.rules)).toBe(true);
    expect(body.count).toBe(body.rules.length);
  });

  it("GET /admin/alert-rules with mismatched deployment_id returns 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/alert-rules?deployment_id=other-dep",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "deployment_mismatch" });
  });

  it("GET /admin/alert-rules with invalid deployment_id returns 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/alert-rules?deployment_id=../../etc",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_deployment_id" });
  });

  it("GET /admin/report-schedules without auth returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/report-schedules",
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /admin/report-schedules with admin token returns schedules list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/report-schedules",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      deployment_id: string;
      schedules: unknown[];
      count: number;
    };
    expect(body.deployment_id).toBe("dep-gh-pilot-001");
    expect(Array.isArray(body.schedules)).toBe(true);
    expect(body.count).toBe(body.schedules.length);
  });

  it("GET /admin/commands/:command_id without auth returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/commands/cmd-123",
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /admin/commands/:command_id on non-existent command returns 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/commands/nonexistent-cmd",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "command_not_found" });
  });
});
