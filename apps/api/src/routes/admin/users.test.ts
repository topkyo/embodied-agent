import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { allocateAgentDataDir, releaseAgentDataDir } from "../../test/isolated-data-dir.js";
import { seedCanonicalSimRegistry } from "../../test/registry-fixture.js";
import { registerAdminUsersRoutes } from "./users.js";
import { saveUsersMap, type UserRecord } from "../../auth/user-store.js";
import { invalidateUsersCache } from "../../auth/users.js";

let testDir: string;
let app: FastifyInstance;
const adminHeaders = { "x-admin-token": "test-admin-token" };

function seedUsers(): void {
  saveUsersMap({
    "u-owner": {
      user_id: "u-owner",
      role: "owner",
      deployment_id: "dep-gh-pilot-001",
      display_name: "Owner",
    },
    "u-operator": {
      user_id: "u-operator",
      role: "operator",
      deployment_id: "dep-gh-pilot-001",
      display_name: "Operator",
    },
  });
  invalidateUsersCache();
}

describe("admin users routes", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("admin-users");
    seedCanonicalSimRegistry();
    seedUsers();
    process.env.ADMIN_TOKEN = "test-admin-token";
    app = Fastify({ logger: false });
    registerAdminUsersRoutes(app);
  });

  afterEach(async () => {
    delete process.env.ADMIN_TOKEN;
    await app.close();
    releaseAgentDataDir(testDir);
  });

  it("GET /admin/users without admin token returns 401", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/users" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
  });

  it("GET /admin/users with admin token returns user list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/users",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { users: UserRecord[] };
    expect(body.users).toHaveLength(2);
    expect(body.users.map((u) => u.user_id).sort()).toEqual(["u-operator", "u-owner"]);
  });

  it("POST /admin/users with admin token creates a new user", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: adminHeaders,
      payload: {
        user_id: "u-new",
        role: "worker",
        deployment_id: "dep-gh-pilot-001",
        display_name: "New Worker",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; user: UserRecord };
    expect(body.ok).toBe(true);
    expect(body.user.user_id).toBe("u-new");
    expect(body.user.role).toBe("worker");
  });

  it("POST /admin/users with invalid role returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: adminHeaders,
      payload: {
        user_id: "u-bad",
        role: "superuser",
        deployment_id: "dep-gh-pilot-001",
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string };
    expect(body.error).toContain("无效角色");
  });

  it("POST /admin/users with empty user_id returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: adminHeaders,
      payload: {
        user_id: "",
        role: "worker",
        deployment_id: "dep-gh-pilot-001",
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string };
    expect(body.error).toContain("user_id");
  });

  it("PUT /admin/users/:user_id updates an existing user", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/admin/users/u-operator",
      headers: adminHeaders,
      payload: {
        display_name: "Updated Operator",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; user: UserRecord };
    expect(body.ok).toBe(true);
    expect(body.user.display_name).toBe("Updated Operator");
  });

  it("PUT /admin/users/:user_id on non-existent user returns 404", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/admin/users/nonexistent",
      headers: adminHeaders,
      payload: { display_name: "Nobody" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "user_not_found" });
  });

  it("DELETE /admin/users/:user_id removes an existing user", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/admin/users/u-operator",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("DELETE /admin/users/:user_id on non-existent user returns 404", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/admin/users/nonexistent",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "user_not_found" });
  });

  it("DELETE /admin/users/:user_id cannot delete the last owner", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/admin/users/u-owner",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string };
    expect(body.error).toContain("最后一个 owner");
  });
});
