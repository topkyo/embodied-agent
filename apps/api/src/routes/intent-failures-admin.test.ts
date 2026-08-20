import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { writeFileSync } from "node:fs";

import { buildApp } from "../app.js";
import { resetPromoteWechatJobsForTest } from "@embodied-agent/agent";
import { getIntentResolver } from "../runtime/agent-context.js";

let testDir: string;
const adminHeaders = { "x-admin-token": "test-admin-token" };

describe("intent-failures admin", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    process.env.ADMIN_TOKEN = "test-admin-token";
  });
  afterEach(() => {
    resetPromoteWechatJobsForTest();
    delete process.env.ADMIN_TOKEN;
    delete process.env.VERCEL;
    releaseAgentDataDir(testDir);
  });

  it("GET /admin/intent-failures requires admin token", async () => {
    const app = await buildApp();
    const unauthorized = await app.inject({
      method: "GET",
      url: "/admin/intent-failures",
    });
    expect(unauthorized.statusCode).toBe(401);
    await app.close();
  });

  it("lists pending failures with filters", async () => {
    const row = {
      id: "f-abc",
      utterance: "测试话术",
      raw_response: '{"skill":"x"}',
      failure_kind: "skill_mismatch",
      confidence: "medium",
      promoted: false,
      platform: "wechat",
      recorded_at: "2026-06-08T12:00:00.000Z",
    };
    writeFileSync(getIntentResolver().failuresPath(), `${JSON.stringify(row)}\n`, "utf8");

    const app = await buildApp();
    const all = await app.inject({
      method: "GET",
      url: "/admin/intent-failures",
      headers: adminHeaders,
    });
    expect(all.statusCode).toBe(200);
    const body = all.json() as { total: number; cases: { id: string }[] };
    expect(body.total).toBe(1);
    expect(body.cases[0]?.id).toBe("f-abc");

    const filtered = await app.inject({
      method: "GET",
      url: "/admin/intent-failures?confidence=high&promoted=false",
      headers: adminHeaders,
    });
    expect((filtered.json() as { total: number }).total).toBe(0);

    await app.close();
  });

  it("returns 400 for invalid promoted query", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/admin/intent-failures?promoted=maybe",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("POST batch promote requires admin token", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/admin/intent-failures/promote-wechat",
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("POST batch promote returns 501 by default without INTENT_PROMOTE_WECHAT_API", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/admin/intent-failures/promote-wechat",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(501);
    const body = res.json() as { error: string };
    expect(body.error).toContain("disabled in this environment");
    await app.close();
  });

  it("POST promote returns 501 on Vercel", async () => {
    process.env.VERCEL = "1";
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/admin/intent-failures/promote-wechat",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(501);
    const body = res.json() as { error: string };
    expect(body.error).toContain("disabled in this environment");
    await app.close();
  });

  it("POST promote single returns 400 when not promotable", async () => {
    const row = {
      id: "f-low",
      utterance: "低置信",
      raw_response: "",
      failure_kind: "skill_mismatch",
      confidence: "low",
      promoted: false,
      recorded_at: "2026-06-08T12:00:00.000Z",
    };
    writeFileSync(getIntentResolver().failuresPath(), `${JSON.stringify(row)}\n`, "utf8");

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/admin/intent-failures/f-low/promote-wechat",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string };
    expect(body.error).toContain("not promotable");
    await app.close();
  });

  it("POST promote single returns 404 for unknown id", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/admin/intent-failures/f-missing/promote-wechat",
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: string };
    expect(body.error).toContain("not found");
    await app.close();
  });
});
