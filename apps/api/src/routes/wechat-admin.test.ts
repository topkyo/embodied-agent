import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { saveSettings } from "../settings/store.js";
import { buildApp } from "../app.js";
import { bindWechatPlatformUser, listBindings } from "../auth/platform-bind.js";

function parseSetCookie(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
  return raw ?? "";
}

function cookieHeader(setCookie: string): string {
  return setCookie.split(";")[0] ?? "";
}

describe("DELETE /admin/wechat/binding", () => {
  let testDir: string;
  const savedEnv = {
    NODE_ENV: process.env.NODE_ENV,
    SESSION_SECRET: process.env.SESSION_SECRET,
    WEB_INSTALL_CODE: process.env.WEB_INSTALL_CODE,
    STATE_BACKEND: process.env.STATE_BACKEND,
  };

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret";
    delete process.env.STATE_BACKEND;
    delete process.env.WEB_INSTALL_CODE;
    testDir = allocateAgentDataDir("wechat-admin");
    saveSettings({ deployment_id: "dep-gh-pilot-001", active_domain: "agriculture" });
  });

  afterEach(() => {
    if (savedEnv.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedEnv.NODE_ENV;
    if (savedEnv.SESSION_SECRET === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = savedEnv.SESSION_SECRET;
    if (savedEnv.WEB_INSTALL_CODE === undefined) delete process.env.WEB_INSTALL_CODE;
    else process.env.WEB_INSTALL_CODE = savedEnv.WEB_INSTALL_CODE;
    if (savedEnv.STATE_BACKEND === undefined) delete process.env.STATE_BACKEND;
    else process.env.STATE_BACKEND = savedEnv.STATE_BACKEND;
    releaseAgentDataDir(testDir);
  });

  it("self-unbind removes the binding row tied to the session principal", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/auth/dev/create-user",
      payload: {
        email: "ops-self@example.com",
        password: "secret-pass",
        display_name: "Ops Self",
        role: "user",
      },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/email",
      payload: { email: "ops-self@example.com", password: "secret-pass" },
    });
    expect(login.statusCode).toBe(200);
    const cookie = cookieHeader(parseSetCookie(login.headers["set-cookie"]));

    // /auth/me → 该 session 的 server-side user_id (UUID 类)
    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
    const sessionUserId = (me.json() as { user_id: string }).user_id;
    expect(sessionUserId).toMatch(/^web-/);

    bindWechatPlatformUser("openid-self-001", sessionUserId, "dep-gh-pilot-001");

    const before = listBindings().filter(
      (b) => b.platform === "wechat" && b.principal_user_id === sessionUserId,
    );
    expect(before.length).toBe(1);

    const del = await app.inject({
      method: "DELETE",
      url: "/admin/wechat/binding",
      headers: { cookie },
    });
    expect(del.statusCode).toBe(200);
    const body = del.json() as {
      ok: boolean;
      removed: number;
      was_connected: boolean;
      principal_user_id: string;
    };
    expect(body.ok).toBe(true);
    expect(body.principal_user_id).toBe(sessionUserId);
    expect(body.was_connected).toBe(true);
    expect(body.removed).toBe(1);

    const after = listBindings().filter(
      (b) => b.platform === "wechat" && b.principal_user_id === sessionUserId,
    );
    expect(after.length).toBe(0);
  });

  it("self-unbind with no binding returns was_connected=false", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/auth/dev/create-user",
      payload: {
        email: "ops-cold@example.com",
        password: "secret-pass",
        display_name: "Ops Cold",
        role: "user",
      },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/email",
      payload: { email: "ops-cold@example.com", password: "secret-pass" },
    });
    expect(login.statusCode).toBe(200);
    const cookie = cookieHeader(parseSetCookie(login.headers["set-cookie"]));

    const del = await app.inject({
      method: "DELETE",
      url: "/admin/wechat/binding",
      headers: { cookie },
    });
    expect(del.statusCode).toBe(200);
    const body = del.json() as {
      ok: boolean;
      was_connected: boolean;
      removed: number;
    };
    expect(body.ok).toBe(true);
    expect(body.was_connected).toBe(false);
    expect(body.removed).toBe(0);
  });

  it("admin via x-admin-token can unbind arbitrary principal via body", async () => {
    const app = await buildApp();
    const victimPrincipal = "manual-disconnect-target-001";
    bindWechatPlatformUser("openid-other-007", victimPrincipal, "dep-gh-pilot-001");
    expect(
      listBindings().filter(
        (b) => b.platform === "wechat" && b.principal_user_id === victimPrincipal,
      ).length,
    ).toBe(1);

    const del = await app.inject({
      method: "DELETE",
      url: "/admin/wechat/binding",
      headers: { "x-admin-token": "dev-admin" },
      payload: { principal_user_id: victimPrincipal },
    });
    expect(del.statusCode).toBe(200);
    const body = del.json() as {
      ok: boolean;
      removed: number;
      was_connected: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.was_connected).toBe(true);
    expect(body.removed).toBe(1);

    expect(
      listBindings().filter(
        (b) => b.platform === "wechat" && b.principal_user_id === victimPrincipal,
      ).length,
    ).toBe(0);
  });

  it("user cannot pass arbitrary principal_user_id", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/auth/dev/create-user",
      payload: {
        email: "peek@example.com",
        password: "secret-pass",
        display_name: "Peek",
        role: "user",
      },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/email",
      payload: { email: "peek@example.com", password: "secret-pass" },
    });
    expect(login.statusCode).toBe(200);
    const cookie = cookieHeader(parseSetCookie(login.headers["set-cookie"]));

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
    const sessionUserId = (me.json() as { user_id: string }).user_id;

    const victimPrincipal = "victim@example.com";
    bindWechatPlatformUser("openid-victim-001", victimPrincipal, "dep-gh-pilot-001");

    const del = await app.inject({
      method: "DELETE",
      url: "/admin/wechat/binding",
      headers: { cookie },
      payload: { principal_user_id: victimPrincipal },
    });
    expect(del.statusCode).toBe(200);
    const body = del.json() as { principal_user_id: string };
    // self-only 覆盖 → principal_user_id 必为 session 自身
    expect(body.principal_user_id).toBe(sessionUserId);
    // 指向 不 能 解 被 的 victim
    expect(
      listBindings().filter(
        (b) => b.platform === "wechat" && b.principal_user_id === victimPrincipal,
      ).length,
    ).toBe(1);
  });
});
