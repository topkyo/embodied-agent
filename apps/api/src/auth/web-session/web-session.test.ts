import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allocateAgentDataDir, releaseAgentDataDir } from "../../test/isolated-data-dir.js";
import { seedCanonicalSimRegistry } from "../../test/registry-fixture.js";
import { saveSettings } from "../../settings/store.js";
import { buildApp } from "../../app.js";

function parseSetCookie(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
  return raw ?? "";
}

function cookieHeader(setCookie: string): string {
  return setCookie.split(";")[0] ?? "";
}

describe("web-session auth", () => {
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
    testDir = allocateAgentDataDir("web-session");
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

  it("logs in with email/password and returns session cookie", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/auth/dev/create-user",
      payload: {
        email: "ops@example.com",
        password: "secret-pass",
        display_name: "Ops User",
        role: "user",
      },
    });
    expect(create.statusCode).toBe(200);

    const login = await app.inject({
      method: "POST",
      url: "/auth/email",
      payload: { email: "ops@example.com", password: "secret-pass" },
    });
    expect(login.statusCode).toBe(200);
    const cookie = parseSetCookie(login.headers["set-cookie"]);
    expect(cookie).toContain("ea_session=");

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: cookieHeader(cookie) },
    });
    expect(me.statusCode).toBe(200);
    expect((me.json() as { role: string }).role).toBe("user");
  });

  it("redeems bootstrap install code for first admin with email/password", async () => {
    process.env.WEB_INSTALL_CODE = "INSTALL-PHASE3";
    const app = await buildApp();
    const bootstrap = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        install_code: "INSTALL-PHASE3",
        email: "admin@example.com",
        password: "admin-pass-1",
        display_name: "Bootstrap Admin",
      },
    });
    expect(bootstrap.statusCode).toBe(200);
    const cookie = parseSetCookie(bootstrap.headers["set-cookie"]);
    expect((bootstrap.json() as { role: string }).role).toBe("admin");

    const adminProbe = await app.inject({
      method: "GET",
      url: "/admin/settings",
      headers: { cookie: cookieHeader(cookie) },
    });
    expect(adminProbe.statusCode).toBe(200);

    const reLogin = await app.inject({
      method: "POST",
      url: "/auth/email",
      payload: { email: "admin@example.com", password: "admin-pass-1" },
    });
    expect(reLogin.statusCode).toBe(200);
  });

  it("rejects bootstrap without email/password", async () => {
    process.env.WEB_INSTALL_CODE = "INSTALL-NO-CREDS";
    const app = await buildApp();
    const bootstrap = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: { install_code: "INSTALL-NO-CREDS", display_name: "Admin" },
    });
    expect(bootstrap.statusCode).toBe(400);
    expect((bootstrap.json() as { error: string }).error).toBe("missing_fields");
  });

  it("rejects short passwords on account create", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/auth/dev/create-user",
      payload: {
        email: "short@example.com",
        password: "short",
        role: "user",
      },
    });
    expect(create.statusCode).toBe(400);
    expect((create.json() as { error: string }).error).toBe("password_too_short");
  });

  it("blocks non-admin web session from admin settings", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/auth/dev/create-user",
      payload: {
        email: "user@example.com",
        password: "secret-pass",
        role: "user",
      },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/email",
      payload: { email: "user@example.com", password: "secret-pass" },
    });
    const cookie = parseSetCookie(login.headers["set-cookie"]);
    const denied = await app.inject({
      method: "GET",
      url: "/admin/settings",
      headers: { cookie: cookieHeader(cookie) },
    });
    expect(denied.statusCode).toBe(401);
  });

  it("allows admin session to create invite and redeem with credentials", async () => {
    process.env.WEB_INSTALL_CODE = "INSTALL-ADMIN";
    const app = await buildApp();
    const bootstrap = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        install_code: "INSTALL-ADMIN",
        email: "admin2@example.com",
        password: "admin-pass-2",
      },
    });
    const adminCookie = parseSetCookie(bootstrap.headers["set-cookie"]);
    const invite = await app.inject({
      method: "POST",
      url: "/auth/invite",
      headers: { cookie: cookieHeader(adminCookie) },
      payload: { role: "user" },
    });
    expect(invite.statusCode).toBe(200);
    const { token } = invite.json() as { token: string };

    const redeemMissing = await app.inject({
      method: "POST",
      url: "/auth/invite/redeem",
      payload: { token },
    });
    expect(redeemMissing.statusCode).toBe(400);

    const redeem = await app.inject({
      method: "POST",
      url: "/auth/invite/redeem",
      payload: {
        token,
        email: "invited@example.com",
        password: "invite-pass",
        display_name: "Invited User",
      },
    });
    expect(redeem.statusCode).toBe(200);
    expect(parseSetCookie(redeem.headers["set-cookie"])).toContain("ea_session=");

    const reLogin = await app.inject({
      method: "POST",
      url: "/auth/email",
      payload: { email: "invited@example.com", password: "invite-pass" },
    });
    expect(reLogin.statusCode).toBe(200);
  });

  it("admin can create accounts, list them, and set password", async () => {
    process.env.WEB_INSTALL_CODE = "INSTALL-ACC";
    const app = await buildApp();
    const bootstrap = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        install_code: "INSTALL-ACC",
        email: "root@example.com",
        password: "root-pass1",
      },
    });
    const adminCookie = cookieHeader(parseSetCookie(bootstrap.headers["set-cookie"]));

    const created = await app.inject({
      method: "POST",
      url: "/auth/account/create",
      headers: { cookie: adminCookie },
      payload: {
        email: "ops2@example.com",
        password: "ops2-pass1",
        role: "user",
      },
    });
    expect(created.statusCode).toBe(200);
    const { user_id } = created.json() as { user_id: string };

    const list = await app.inject({
      method: "GET",
      url: "/auth/accounts",
      headers: { cookie: adminCookie },
    });
    expect(list.statusCode).toBe(200);
    const accounts = (
      list.json() as { accounts: Array<{ email?: string; password_hash?: string }> }
    ).accounts;
    expect(accounts.some((a) => a.email === "ops2@example.com")).toBe(true);
    expect(accounts.every((a) => a.password_hash === undefined)).toBe(true);

    const setPw = await app.inject({
      method: "POST",
      url: "/auth/account/password",
      headers: { cookie: adminCookie },
      payload: { user_id, password: "ops2-pass2" },
    });
    expect(setPw.statusCode).toBe(200);

    const login = await app.inject({
      method: "POST",
      url: "/auth/email",
      payload: { email: "ops2@example.com", password: "ops2-pass2" },
    });
    expect(login.statusCode).toBe(200);

    const userCookie = cookieHeader(parseSetCookie(login.headers["set-cookie"]));
    const listDenied = await app.inject({
      method: "GET",
      url: "/auth/accounts",
      headers: { cookie: userCookie },
    });
    expect(listDenied.statusCode).toBe(401);
  });

  it("logout succeeds without session", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/auth/logout" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { ok: boolean }).ok).toBe(true);
  });

  it("bootstrap-status reflects configuration and redemption", async () => {
    const app = await buildApp();
    const unconfigured = await app.inject({ method: "GET", url: "/auth/bootstrap-status" });
    expect(unconfigured.statusCode).toBe(200);
    expect(unconfigured.json()).toEqual({ available: false, redeemed: false });

    process.env.WEB_INSTALL_CODE = "INSTALL-STATUS";
    const app2 = await buildApp();
    const available = await app2.inject({ method: "GET", url: "/auth/bootstrap-status" });
    expect(available.json()).toEqual({ available: true, redeemed: false });

    await app2.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        install_code: "INSTALL-STATUS",
        email: "status@example.com",
        password: "status-pw1",
      },
    });
    const after = await app2.inject({ method: "GET", url: "/auth/bootstrap-status" });
    expect(after.json()).toEqual({ available: false, redeemed: true });
  });

  it("user session can read overview/nodes but not platform settings", async () => {
    process.env.WEB_INSTALL_CODE = "INSTALL-OPS";
    seedCanonicalSimRegistry();
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        install_code: "INSTALL-OPS",
        email: "ops-admin@example.com",
        password: "ops-admin1",
      },
    });
    await app.inject({
      method: "POST",
      url: "/auth/dev/create-user",
      payload: {
        email: "ops-user@example.com",
        password: "ops-user-1",
        role: "user",
      },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/email",
      payload: { email: "ops-user@example.com", password: "ops-user-1" },
    });
    const cookie = cookieHeader(parseSetCookie(login.headers["set-cookie"]));

    const settings = await app.inject({
      method: "GET",
      url: "/admin/settings",
      headers: { cookie },
    });
    expect(settings.statusCode).toBe(401);

    const domainPacks = await app.inject({
      method: "GET",
      url: "/admin/domain-packs",
      headers: { cookie },
    });
    expect(domainPacks.statusCode).toBe(401);

    const publicPacks = await app.inject({ method: "GET", url: "/domain-packs" });
    expect(publicPacks.statusCode).toBe(200);

    const overview = await app.inject({
      method: "GET",
      url: "/admin/overview",
      headers: { cookie },
    });
    expect(overview.statusCode).toBe(200);

    const nodes = await app.inject({
      method: "GET",
      url: "/admin/nodes",
      headers: { cookie },
    });
    expect(nodes.statusCode).toBe(200);

    const readiness = await app.inject({
      method: "GET",
      url: "/admin/platform/readiness",
      headers: { cookie },
    });
    expect(readiness.statusCode).toBe(200);

    // ReadonlyOpsPanel 只读运维接口：user session 可读
    const alertRules = await app.inject({
      method: "GET",
      url: "/admin/alert-rules",
      headers: { cookie },
    });
    expect(alertRules.statusCode).toBe(200);

    const reportSchedules = await app.inject({
      method: "GET",
      url: "/admin/report-schedules",
      headers: { cookie },
    });
    expect(reportSchedules.statusCode).toBe(200);

    const commands = await app.inject({
      method: "GET",
      url: "/admin/commands?limit=10",
      headers: { cookie },
    });
    expect(commands.statusCode).toBe(200);
  });

  it("wechat status allows any web session; login start forces non-admin principal", async () => {
    process.env.WEB_INSTALL_CODE = "INSTALL-WX";
    const app = await buildApp();
    const bootstrap = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        install_code: "INSTALL-WX",
        email: "wx-admin@example.com",
        password: "wx-admin-1",
      },
    });
    const adminCookie = cookieHeader(parseSetCookie(bootstrap.headers["set-cookie"]));

    await app.inject({
      method: "POST",
      url: "/auth/account/create",
      headers: { cookie: adminCookie },
      payload: {
        email: "wx-user@example.com",
        password: "wx-user-1",
        role: "user",
      },
    });
    const userLogin = await app.inject({
      method: "POST",
      url: "/auth/email",
      payload: { email: "wx-user@example.com", password: "wx-user-1" },
    });
    const userCookie = cookieHeader(parseSetCookie(userLogin.headers["set-cookie"]));
    const userId = (userLogin.json() as { user_id: string }).user_id;

    const anonStatus = await app.inject({ method: "GET", url: "/admin/wechat/status" });
    expect(anonStatus.statusCode).toBe(401);

    const userStatus = await app.inject({
      method: "GET",
      url: "/admin/wechat/status",
      headers: { cookie: userCookie },
    });
    expect(userStatus.statusCode).toBe(200);
    expect(userStatus.json()).toMatchObject({
      clawbot_connected: false,
      connected: false,
    });
    expect((userStatus.json() as { accounts?: unknown }).accounts).toBeUndefined();

    const adminStatus = await app.inject({
      method: "GET",
      url: "/admin/wechat/status",
      headers: { cookie: adminCookie },
    });
    expect(adminStatus.statusCode).toBe(200);
    expect(Array.isArray((adminStatus.json() as { accounts: unknown[] }).accounts)).toBe(true);

    // Non-admin cannot poll a foreign session_key (no ownership).
    const foreignPoll = await app.inject({
      method: "GET",
      url: "/admin/wechat/login/status?session_key=00000000-0000-4000-8000-000000000001",
      headers: { cookie: userCookie },
    });
    // Missing session returns idle public view (ok:true) — no ownership to check.
    expect(foreignPoll.statusCode).toBe(200);

    // Start without redis should attempt QR (may 503 if network); principal is forced server-side.
    // Anonymous start denied.
    const anonStart = await app.inject({
      method: "POST",
      url: "/admin/wechat/login/start",
      payload: { principal_user_id: userId },
    });
    expect(anonStart.statusCode).toBe(401);
  });

  it("expired session is rejected by /auth/me", async () => {
    const { ephemeralSetJson } = await import("./ephemeral-store.js");
    const { parseSessionCookieValue } = await import("./cookie.js");

    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/auth/dev/create-user",
      payload: {
        email: "exp@example.com",
        password: "expire-pass1",
        role: "user",
      },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/email",
      payload: { email: "exp@example.com", password: "expire-pass1" },
    });
    const setCookie = parseSetCookie(login.headers["set-cookie"]);
    const raw = cookieHeader(setCookie).replace(/^ea_session=/, "");
    const sessionId = parseSessionCookieValue(decodeURIComponent(raw));
    expect(sessionId).toBeTruthy();

    // Wrapper TTL still valid; payload expires_at in the past → loadWebSession 应销毁并拒绝。
    await ephemeralSetJson(
      "web-session",
      sessionId!,
      {
        session_id: sessionId!,
        user_id: "u-expired",
        role: "user" as const,
        display_name: "Expired",
        created_at: Date.now() - 60_000,
        expires_at: Date.now() - 1_000,
      },
      3600,
    );

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: cookieHeader(setCookie) },
    });
    expect(me.statusCode).toBe(401);
  });

  it("near-expiry session is sliding-renewed with a fresh cookie", async () => {
    const { ephemeralGetJson, ephemeralSetJson } = await import("./ephemeral-store.js");
    const { parseSessionCookieValue } = await import("./cookie.js");

    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/auth/dev/create-user",
      payload: {
        email: "renew@example.com",
        password: "************",
        role: "user",
      },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/email",
      payload: { email: "renew@example.com", password: "************" },
    });
    const setCookie = parseSetCookie(login.headers["set-cookie"]);
    const raw = cookieHeader(setCookie).replace(/^ea_session=/, "");
    const sessionId = parseSessionCookieValue(decodeURIComponent(raw));
    expect(sessionId).toBeTruthy();

    // 剩余 60s（低于 TTL 一半）但尚未过期 → 应触发滑动续期。
    await ephemeralSetJson(
      "web-session",
      sessionId!,
      {
        session_id: sessionId!,
        user_id: "u-renew",
        role: "user" as const,
        display_name: "Renew",
        created_at: Date.now() - 840_000,
        expires_at: Date.now() + 60_000,
      },
      3600,
    );

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: cookieHeader(setCookie) },
    });
    expect(me.statusCode).toBe(200);
    const renewedCookie = parseSetCookie(me.headers["set-cookie"]);
    expect(renewedCookie).toContain("ea_session=");

    const stored = await ephemeralGetJson<{ expires_at: number }>("web-session", sessionId!);
    expect(stored).toBeTruthy();
    // 续期后 expires_at 应接近完整 TTL（15 分钟）。
    expect(stored!.expires_at).toBeGreaterThan(Date.now() + 10 * 60 * 1000);
  });

  it("fresh session does not trigger renewal cookie", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/auth/dev/create-user",
      payload: {
        email: "fresh@example.com",
        password: "************",
        role: "user",
      },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/email",
      payload: { email: "fresh@example.com", password: "************" },
    });
    const setCookie = parseSetCookie(login.headers["set-cookie"]);

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: cookieHeader(setCookie) },
    });
    expect(me.statusCode).toBe(200);
    expect(me.headers["set-cookie"]).toBeUndefined();
  });

  it("tampered session cookie signature is rejected", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/auth/dev/create-user",
      payload: {
        email: "tamper@example.com",
        password: "tamper-pass1",
        role: "user",
      },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/email",
      payload: { email: "tamper@example.com", password: "tamper-pass1" },
    });
    const setCookie = parseSetCookie(login.headers["set-cookie"]);
    const pair = cookieHeader(setCookie);
    const value = pair.replace(/^ea_session=/, "");
    const decoded = decodeURIComponent(value);
    const tampered = decoded.slice(0, -1) + (decoded.endsWith("a") ? "b" : "a");
    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: `ea_session=${encodeURIComponent(tampered)}` },
    });
    expect(me.statusCode).toBe(401);
  });

  it("logout destroys session so subsequent /auth/me is unauthenticated", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/auth/dev/create-user",
      payload: {
        email: "logout@example.com",
        password: "logout-pass1",
        role: "user",
      },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/email",
      payload: { email: "logout@example.com", password: "logout-pass1" },
    });
    const cookie = cookieHeader(parseSetCookie(login.headers["set-cookie"]));
    const before = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie },
    });
    expect(before.statusCode).toBe(200);

    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(200);

    const after = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie },
    });
    expect(after.statusCode).toBe(401);
  });
});

describe("web-session cookie secret", () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };

  afterEach(() => {
    if (saved.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved.NODE_ENV;
    if (saved.SESSION_SECRET === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = saved.SESSION_SECRET;
  });

  it("resolveSessionSecret throws in production without SESSION_SECRET", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.SESSION_SECRET;
    const { resolveSessionSecret } = await import("./cookie.js");
    expect(() => resolveSessionSecret()).toThrow(/SESSION_SECRET/);
  });
});
