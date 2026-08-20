import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  ensureWebUser,
  loginViaUi,
  reseedsWebSessionAs,
  seedWebSession,
} from "./helpers/web-auth.js";

const API_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:3001";

async function apiHealthy(request: APIRequestContext): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await request.get(`${API_URL}/health`);
      if (res.ok()) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function requireApiHealthy(request: APIRequestContext): Promise<void> {
  const healthy = await apiHealthy(request);
  if (!healthy) {
    if (process.env.CI) {
      throw new Error("API unhealthy in CI");
    }
    test.skip(true, "API not running at " + API_URL);
  }
}

test.describe("dogfood interactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("ea_lang", "en");
    });
  });

  test("unauthenticated ops redirects to login", async ({ page, request }) => {
    await requireApiHealthy(request);
    await page.goto("/scenes/greenhouse/ops");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("ops EN nav shows translated labels for user session", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "user");
    await page.goto("/scenes/greenhouse/ops");
    await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Devices" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Scene operations overview/i })).toBeVisible();
  });

  test("overview action-flow is visible without web confirm buttons", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "user");
    await page.goto("/scenes/greenhouse/ops");
    await expect(page.getByRole("heading", { name: /Scene operations overview/i })).toBeVisible({
      timeout: 15_000,
    });

    const actionFlow = page.getByTestId("action-flow");
    await expect(actionFlow).toBeVisible({ timeout: 15_000 });

    const progress = actionFlow.getByTestId("action-flow-progress");
    if (await progress.count()) {
      await expect(progress).toBeVisible();
    }

    // Pending confirm/reject are WeChat-only; scope to action-flow to avoid nav/lang noise.
    await expect(actionFlow.getByRole("button", { name: /^Confirm execution/i })).toHaveCount(0);
    await expect(actionFlow.getByRole("button", { name: /^Reject$/i })).toHaveCount(0);
    await expect(actionFlow.getByRole("button", { name: /^Confirm$/i })).toHaveCount(0);
  });

  test("user session hides admin nav items @critical", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "user");
    await page.goto("/scenes/greenhouse/ops");
    await expect(page.getByRole("link", { name: "Review" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Platform base" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
  });

  test("role switch user then admin does not leak user denial @critical", async ({
    page,
    request,
  }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "user", { emailPrefix: "switch" });
    await page.goto("/scenes/greenhouse/ops/platform");
    await expect(page.getByRole("heading", { name: "Admin access required" })).toBeVisible();

    await reseedsWebSessionAs(page.context(), request, "admin", { emailPrefix: "switch" });
    await page.goto("/scenes/greenhouse/ops/platform");
    await expect(page.getByRole("heading", { name: "Deployment health" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Admin access required" })).toHaveCount(0);
  });

  test("devices page shows install and binding shell", async ({ page, request }) => {
    await requireApiHealthy(request);
    // 装机/pair 入口仅 admin 可见（user 只读列表）
    await seedWebSession(page.context(), request, "admin");
    await page.goto("/scenes/greenhouse/ops/devices");
    await expect(
      page.getByRole("heading", { name: "Device install & bind", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Pair page" })).toBeVisible();
  });

  test("pair page EN title and tab", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "admin");
    await page.goto("/scenes/greenhouse/ops/devices/pair?node_id=test-node");
    await expect(page.getByRole("heading", { name: "Scene node QR pairing" })).toBeVisible();
    await expect(page).toHaveTitle(/Scene node QR pairing/);
  });

  test("user pair route shows admin-only shell", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "user");
    await page.goto("/scenes/greenhouse/ops/devices/pair");
    await expect(page.getByRole("heading", { name: "Admin access required" })).toBeVisible();
  });

  test("scene settings save shows Saved without LLM restart note", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "admin");
    await page.goto("/scenes/greenhouse/ops/settings");
    await page.getByRole("button", { name: "Save Configuration" }).click();
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/restart the API/i)).not.toBeVisible();
  });

  test("overview vent/fan show readings or no-telemetry shell", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "user");
    await page.goto("/scenes/greenhouse/ops");
    await expect(page.getByRole("heading", { name: /Scene operations overview/i })).toBeVisible({
      timeout: 15_000,
    });
    // 禁止 empty 软绿：必须出现温室卡片（entities）或 nodes 列表（registry 绑定）。
    const cards = page.locator(".greenhouse-card");
    const nodeItems = page.locator(".ops-overview-nodes-item");
    await expect
      .poll(
        async () => {
          if (await cards.count()) return "cards";
          if (await nodeItems.count()) return "nodes";
          return "pending";
        },
        { timeout: 15_000 },
      )
      .not.toBe("pending");
    if ((await cards.count()) > 0) {
      // 卡片内：有遥测 → Vent/Fan 且值不为 unknown；无遥测 → "No telemetry"
      const noTelemetry = page.getByText("No telemetry");
      const readings = page.locator(".greenhouse-readings");
      await expect
        .poll(
          async () => {
            if (await noTelemetry.count()) return "no-telemetry";
            if (await readings.count()) return "readings";
            return "pending";
          },
          { timeout: 10_000 },
        )
        .not.toBe("pending");
      if ((await readings.count()) > 0) {
        await expect(page.getByText("Vent", { exact: true }).first()).toBeVisible();
        await expect(page.getByText("Fan", { exact: true }).first()).toBeVisible();
        const values = await readings.locator("strong").allTextContents();
        for (const value of values) {
          expect(value.trim().toLowerCase()).not.toBe("unknown");
        }
      }
    } else {
      // entities 未进 OverviewPanel 时仍须证明 overview 数据面：节点列表含 entity_id
      await expect(nodeItems.first()).toBeVisible();
      await expect(nodeItems.filter({ hasText: /gh-00\d/ }).first()).toBeVisible();
    }
  });

  test("platform base denies access without admin session @critical", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "user");
    await page.goto("/scenes/greenhouse/ops/platform");
    await expect(page.getByRole("heading", { name: "Admin access required" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin sign-in" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Domain Pack ops schema" })).toHaveCount(0);
  });

  test("platform base shows readiness with admin session @critical", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "admin");
    await page.goto("/scenes/greenhouse/ops/platform");
    // 首屏锚点：readiness 产品标题（schema 默认折叠，不可见）
    await expect(page.getByRole("heading", { name: "Deployment health" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Refresh" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Admin access required" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Domain Pack ops schema" })).toHaveCount(0);
  });

  test("placeholder pack ops shows disabled shell @critical", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "user");
    await page.goto("/scenes/aquaculture/ops");
    await expect(page.getByRole("heading", { name: "Scene ops not available yet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to WeChat start" })).toBeVisible();
  });

  test("mobile ops drawer opens sidebar navigation", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "user");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/scenes/greenhouse/ops");
    const menu = page.getByRole("button", { name: "Open menu" });
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(page.locator(".console-sidebar.open")).toBeVisible();
    await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
  });

  test("mobile ops topbar does not force page horizontal scroll", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "user");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/scenes/greenhouse/ops");
    const overflowX = await page.evaluate(() => {
      const docW = document.documentElement.clientWidth;
      const underFixedOrSticky = (el: Element) => {
        let node: Element | null = el;
        while (node) {
          const pos = getComputedStyle(node).position;
          if (pos === "fixed" || pos === "sticky") return true;
          node = node.parentElement;
        }
        return false;
      };
      return [...document.querySelectorAll("body *")].some((el) => {
        if (underFixedOrSticky(el)) return false;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.right > docW + 1;
      });
    });
    expect(overflowX).toBe(false);
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
    await expect(
      page
        .locator(
          '[data-testid="readiness-badge"], .scene-ops-readiness-badge, .scene-ops-readiness-badge-link',
        )
        .first(),
    ).toBeVisible();
  });

  test("mobile ops type and touch sizing floors", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "user");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/scenes/greenhouse/ops");

    const menu = page.getByRole("button", { name: "Open menu" });
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    expect(menuBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    await menu.click();
    const overview = page.getByRole("link", { name: "Overview" });
    await expect(overview).toBeVisible();
    const overviewSize = await overview.evaluate((el) => {
      const s = getComputedStyle(el);
      return { fontSize: parseFloat(s.fontSize), height: el.getBoundingClientRect().height };
    });
    expect(overviewSize.fontSize).toBeGreaterThanOrEqual(14);
    expect(overviewSize.height).toBeGreaterThanOrEqual(44);
  });

  test("mobile login type and touch sizing floors", async ({ page, request }) => {
    await requireApiHealthy(request);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    const email = page.locator(".login-panel input").first();
    await expect(email).toBeVisible();
    const size = await email.evaluate((el) => {
      const s = getComputedStyle(el);
      return { fontSize: parseFloat(s.fontSize), height: el.getBoundingClientRect().height };
    });
    expect(size.fontSize).toBeGreaterThanOrEqual(14);
    expect(size.height).toBeGreaterThanOrEqual(44);
  });

  test("wechat start renders binding headline and active scene", async ({ page, request }) => {
    await requireApiHealthy(request);
    await page.goto("/start/wechat");
    await expect(page.getByRole("heading", { name: "WhatsApp is your console." })).toBeVisible();
    await expect(page.getByRole("tab", { name: "I'm a user" })).toHaveCount(0);
    await expect(page.getByText("Current scene")).toBeVisible();
    await expect(page.getByText("Farm Steward", { exact: true })).toBeVisible();
  });

  test("greenhouse control shows no manual console shell", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "user");
    await page.goto("/scenes/greenhouse/ops/control");
    await expect(
      page.getByRole("heading", { name: "This scene has no manual control console" }),
    ).toBeVisible();
  });

  test("greenhouse review denies access without admin session @critical", async ({
    page,
    request,
  }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "user");
    await page.goto("/scenes/greenhouse/ops/review");
    await expect(page.getByRole("heading", { name: "Admin access required" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Scene review" })).toHaveCount(0);
  });

  test("greenhouse review shows panel with admin session", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "admin");
    await page.goto("/scenes/greenhouse/ops/review");
    await expect(page.getByRole("heading", { name: "Scene review" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Admin access required" })).toHaveCount(0);
  });

  test("greenhouse users page shows user management shell for admin", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "admin");
    await page.goto("/scenes/greenhouse/ops/users");
    await expect(page.getByRole("heading", { level: 1, name: "Workbench users" })).toBeVisible();
  });

  test("user settings and users routes show admin-only shell", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "user");
    await page.goto("/scenes/greenhouse/ops/settings");
    await expect(page.getByRole("heading", { name: "Admin access required" })).toBeVisible();
    await page.goto("/scenes/greenhouse/ops/users");
    await expect(page.getByRole("heading", { name: "Admin access required" })).toBeVisible();
  });

  // L2：中文 locale 无企微/SMS 空壳
  test("zh platform has no enterprise or sms stubs", async ({ page, request }) => {
    await requireApiHealthy(request);
    await page.addInitScript(() => {
      localStorage.setItem("ea_lang", "zh");
    });
    await seedWebSession(page.context(), request, "admin");
    await page.goto("/scenes/greenhouse/ops/platform");
    // zh:「部署健康状态」；en:「Deployment health」
    await expect(
      page.getByRole("heading", { name: /部署健康状态|Deployment health/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("企业微信")).toHaveCount(0);
    await expect(page.getByText("短信")).toHaveCount(0);
  });

  // P4b：三域装机对等 — robot / industrial 至少 1 个语义 heading（非仅 body）。
  // active 时为总览标题；非 active 时为禁用壳标题；均须 role=heading，禁止只断言 body。
  test("admin robot ops shows a semantic heading", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "admin");
    await page.goto("/scenes/robot/ops");
    await expect(
      page
        .getByRole("heading", { name: /Scene operations overview|Scene ops not available yet/i })
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("admin industrial ops shows a semantic heading", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "admin");
    await page.goto("/scenes/industrial/ops");
    await expect(
      page
        .getByRole("heading", { name: /Scene operations overview|Scene ops not available yet/i })
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("inactive live pack ops shows disabled shell @critical", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "user");
    // 不硬编码 robot：从公开 catalog 取 active_domain 与任一其它 live pack。
    const res = await request.get(`${API_URL}/domain-packs`);
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      active_domain?: string;
      catalog?: Array<{ id: string; status?: string }>;
    };
    const active = body.active_domain?.trim() || "agriculture";
    const inactive = (body.catalog ?? []).find(
      (e) => e.status === "live" && e.id && e.id !== active,
    );
    expect(inactive, `need a non-active live pack (active=${active})`).toBeTruthy();
    const slugByPackId: Record<string, string> = {
      agriculture: "greenhouse",
      robotics: "robot",
      industrial: "industrial",
    };
    const slug = slugByPackId[inactive!.id];
    expect(slug, `unknown pack id for ops slug: ${inactive!.id}`).toBeTruthy();
    await page.goto(`/scenes/${slug}/ops`);
    await expect(page.getByRole("heading", { name: "Scene ops not available yet" })).toBeVisible({
      timeout: 15_000,
    });
    // 文案含当前 active_domain，证明是 inactive_domain 而非 placeholder
    await expect(page.getByText(new RegExp(active, "i"))).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to WeChat start" })).toBeVisible();
  });

  test("email login via UI reaches wechat start", async ({ page, request }) => {
    await requireApiHealthy(request);
    const email = "e2e-ui-login@example.com";
    const password = "e2e-pass-ui";
    await ensureWebUser(request, {
      email,
      password,
      role: "user",
      displayName: "E2E UI Login",
    });
    await loginViaUi(page, email, password);
    await expect(page).toHaveURL(/\/start\/wechat/, { timeout: 15_000 });
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("email login via UI shows error on bad password", async ({ page, request }) => {
    await requireApiHealthy(request);
    const email = "e2e-ui-bad@example.com";
    await ensureWebUser(request, {
      email,
      password: "e2e-pass-good",
      role: "user",
      displayName: "E2E UI Bad",
    });
    await loginViaUi(page, email, "wrong-password");
    await expect(page.locator(".login-error")).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("user session cannot save settings (API denies write)", async ({ page, request }) => {
    await requireApiHealthy(request);
    await seedWebSession(page.context(), request, "user");
    await page.goto("/scenes/greenhouse/ops/settings");
    // D0 B2：user 直链 settings 为 AdminOnly 壳（无保存按钮），不得出现 Saved。
    await expect(page.getByRole("heading", { name: "Admin access required" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Save Configuration" })).toHaveCount(0);
    await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
  });
});
