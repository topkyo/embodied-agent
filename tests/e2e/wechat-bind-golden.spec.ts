/**
 * 微信绑定契约 e2e（session 模型）。
 * 默认不进 PR @critical（nightly 全量）；见计划 Phase C。
 */
import { test, expect } from "@playwright/test";
import { loginWebUser, ensureWebUser } from "./helpers/web-auth.js";
import { apiWithSession, ensureZhLocale, waitForApiHealthy } from "./helpers/wechat-bind.js";

const API_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:3001";
const WEB_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";

test.describe("wechat bind golden path", () => {
  test.beforeEach(async ({ request }) => {
    await waitForApiHealthy(request, API_URL);
  });

  test("anonymous wechat status and login start are unauthorized", async ({ request }) => {
    const status = await request.get(`${API_URL}/admin/wechat/status`);
    expect(status.status()).toBe(401);

    const start = await request.post(`${API_URL}/admin/wechat/login/start`, {
      data: {},
    });
    expect(start.status()).toBe(401);
  });

  test("user session can read self wechat status; foreign session_key poll is forbidden when owned", async ({
    request,
  }) => {
    const email = "e2e-wx-bind-user@example.com";
    const password = "e2e-pass-wx";
    await ensureWebUser(request, {
      email,
      password,
      role: "user",
      displayName: "E2E Wechat Bind",
    });
    const cookie = await loginWebUser(request, email, password);

    const status = await apiWithSession(request, API_URL, cookie, "GET", "/admin/wechat/status");
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({
      clawbot_connected: expect.any(Boolean),
    });
    expect((status.body as { accounts?: unknown }).accounts).toBeUndefined();

    // Missing session_key → 400
    const missingKey = await apiWithSession(
      request,
      API_URL,
      cookie,
      "GET",
      "/admin/wechat/login/status",
    );
    expect(missingKey.status).toBe(400);

    // Start as self (may 503 if ilink mock QR fails — still proves auth passed 401)
    const start = await apiWithSession(
      request,
      API_URL,
      cookie,
      "POST",
      "/admin/wechat/login/start",
      {},
    );
    expect([200, 503]).toContain(start.status);
    if (start.status === 200) {
      const sessionKey = (start.body as { session_key?: string }).session_key;
      expect(sessionKey).toBeTruthy();

      // Same user can poll own session
      const ownPoll = await apiWithSession(
        request,
        API_URL,
        cookie,
        "GET",
        `/admin/wechat/login/status?session_key=${encodeURIComponent(sessionKey!)}`,
      );
      expect(ownPoll.status).toBe(200);

      // Second user cannot poll first user's session_key
      const email2 = "e2e-wx-bind-user2@example.com";
      await ensureWebUser(request, {
        email: email2,
        password,
        role: "user",
        displayName: "E2E Wechat Bind 2",
      });
      const cookie2 = await loginWebUser(request, email2, password);
      const foreign = await apiWithSession(
        request,
        API_URL,
        cookie2,
        "GET",
        `/admin/wechat/login/status?session_key=${encodeURIComponent(sessionKey!)}`,
      );
      expect(foreign.status).toBe(403);
    }
  });

  test("logged-in user sees wechat start bind surface in zh locale", async ({ page, request }) => {
    await ensureZhLocale(page);
    const email = "e2e-wx-ui-user@example.com";
    const password = "e2e-pass-wx";
    await ensureWebUser(request, {
      email,
      password,
      role: "user",
      displayName: "E2E Wx UI",
    });
    const cookie = await loginWebUser(request, email, password);
    await page.context().addCookies([
      {
        name: "ea_session",
        value: cookie,
        url: WEB_URL,
      },
    ]);

    await page.goto("/start/wechat");
    // Bound or unbound: page must not bounce to login; zh shell for bind.
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).toBeVisible();
    // StartWechat renders scene/bind region for authenticated principal path
    await expect(
      page.getByText(/当前场景|微信|绑定|扫码|Farm|scene|WeChat|WhatsApp/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
