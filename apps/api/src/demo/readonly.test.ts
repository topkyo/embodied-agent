import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { saveSettings } from "../settings/store.js";
import { resetRuntimeInitForTests } from "../runtime/init.js";
import { assertDemoReadonlyEnv, isDemoReadonlyPublicGet, requestPathname } from "./readonly.js";

let testDir: string;
let savedDemoReadonly: string | undefined;
let savedNodeEnv: string | undefined;

describe("demo readonly env", () => {
  let savedDemoStack: string | undefined;
  let savedNodeEnv: string | undefined;

  afterEach(() => {
    if (savedDemoReadonly === undefined) delete process.env.DEMO_READONLY;
    else process.env.DEMO_READONLY = savedDemoReadonly;
    if (savedDemoStack === undefined) delete process.env.DEMO_STACK;
    else process.env.DEMO_STACK = savedDemoStack;
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
  });

  beforeEach(() => {
    savedDemoReadonly = process.env.DEMO_READONLY;
    savedDemoStack = process.env.DEMO_STACK;
    savedNodeEnv = process.env.NODE_ENV;
  });

  it("accepts DEMO_READONLY=1 in development", () => {
    process.env.NODE_ENV = "development";
    process.env.DEMO_READONLY = "1";
    delete process.env.DEMO_STACK;
    expect(() => assertDemoReadonlyEnv()).not.toThrow();
  });

  it("rejects DEMO_READONLY=1 in production without DEMO_STACK", () => {
    process.env.NODE_ENV = "production";
    process.env.DEMO_READONLY = "1";
    delete process.env.DEMO_STACK;
    expect(() => assertDemoReadonlyEnv()).toThrow(/DEMO_STACK/);
  });

  it("accepts DEMO_READONLY=1 in production with DEMO_STACK=1", () => {
    process.env.NODE_ENV = "production";
    process.env.DEMO_READONLY = "1";
    process.env.DEMO_STACK = "1";
    expect(() => assertDemoReadonlyEnv()).not.toThrow();
  });

  it("throws for invalid DEMO_READONLY values", () => {
    process.env.DEMO_READONLY = "true";
    expect(() => assertDemoReadonlyEnv()).toThrow(/DEMO_READONLY/);
  });

  it("matches public GET paths", () => {
    expect(isDemoReadonlyPublicGet("GET", "/admin/overview")).toBe(true);
    expect(isDemoReadonlyPublicGet("GET", "/admin/commands/cmd-001")).toBe(true);
    expect(isDemoReadonlyPublicGet("POST", "/admin/overview")).toBe(false);
    expect(isDemoReadonlyPublicGet("GET", "/admin/settings")).toBe(false);
    expect(requestPathname("/admin/overview?limit=5")).toBe("/admin/overview");
  });
});

describe("demo readonly middleware", () => {
  beforeEach(() => {
    savedDemoReadonly = process.env.DEMO_READONLY;
    savedNodeEnv = process.env.NODE_ENV;
    process.env.DEMO_READONLY = "1";
    process.env.NODE_ENV = "development";
    testDir = allocateAgentDataDir("demo-readonly");
    seedCanonicalSimRegistry();
    saveSettings({ deployment_id: "dep-gh-pilot-001", active_domain: "agriculture" });
  });

  afterEach(() => {
    resetRuntimeInitForTests();
    if (savedDemoReadonly === undefined) delete process.env.DEMO_READONLY;
    else process.env.DEMO_READONLY = savedDemoReadonly;
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
    releaseAgentDataDir(testDir);
  });

  it("allows anonymous GET /health", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("allows anonymous GET /admin/overview", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/admin/overview" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      deployment_id: "dep-gh-pilot-001",
      entities: expect.any(Array),
    });
  });

  it("returns 403 for POST mutations", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/admin/users",
      payload: { user_id: "u1", role: "owner", deployment_id: "dep-gh-pilot-001" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "demo_readonly_write_forbidden" });
  });

  it("returns 403 for PUT mutations", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "PUT",
      url: "/admin/settings",
      payload: { deployment_name: "blocked" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "demo_readonly_write_forbidden" });
  });

  it("requires admin token for non-public GET routes", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/admin/settings" });
    expect(res.statusCode).toBe(401);
  });
});
