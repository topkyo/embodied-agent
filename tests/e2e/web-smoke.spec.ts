import { test, expect } from "@playwright/test";
import { seedWebSession } from "./helpers/web-auth.js";

const PUBLIC_ROUTES = [
  { path: "/", name: "root redirects to start picker" },
  { path: "/start", name: "live domain picker" },
  { path: "/start/wechat", name: "wechat start" },
  { path: "/start/wechat?pack=greenhouse", name: "wechat start with pack hint" },
  { path: "/login", name: "login" },
] as const;

const AUTH_ROUTES = [
  { path: "/scenes/greenhouse/ops", name: "greenhouse ops overview" },
  { path: "/scenes/greenhouse/ops/control", name: "greenhouse ops control" },
  { path: "/scenes/greenhouse/ops/devices", name: "greenhouse ops devices" },
  { path: "/scenes/greenhouse/ops/settings", name: "greenhouse ops settings" },
  { path: "/scenes/greenhouse/ops/users", name: "greenhouse ops users" },
  { path: "/scenes/greenhouse/ops/review", name: "greenhouse ops review" },
  { path: "/scenes/greenhouse/ops/platform", name: "greenhouse ops platform gate" },
  { path: "/scenes/robot/ops", name: "robot ops overview" },
  { path: "/scenes/robot/ops/devices", name: "robot ops devices" },
  { path: "/scenes/robot/ops/settings", name: "robot ops settings" },
  { path: "/scenes/robot/ops/platform", name: "robot ops platform" },
  { path: "/scenes/industrial/ops", name: "industrial ops overview" },
  { path: "/scenes/industrial/ops/devices", name: "industrial ops devices" },
  { path: "/scenes/industrial/ops/settings", name: "industrial ops settings" },
  { path: "/scenes/industrial/ops/platform", name: "industrial ops platform" },
] as const;

test.describe("web smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("ea_lang", "en");
    });
  });

  test("root redirects to start picker", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/start$/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("unauthenticated ops redirects to login", async ({ page }) => {
    await page.goto("/scenes/greenhouse/ops");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  for (const route of PUBLIC_ROUTES) {
    test(`${route.name} route is reachable`, async ({ page }) => {
      const res = await page.goto(route.path);
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator("body")).toBeVisible();
    });
  }

  for (const route of AUTH_ROUTES) {
    test(`${route.name} route is reachable with session`, async ({ page, request }) => {
      await seedWebSession(page.context(), request, "admin");
      const res = await page.goto(route.path);
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator("body")).toBeVisible();
    });
  }

  test("user session platform shows admin denial heading", async ({ page, request }) => {
    await seedWebSession(page.context(), request, "user");
    await page.goto("/scenes/greenhouse/ops/platform");
    await expect(page.getByRole("heading", { name: "Admin access required" })).toBeVisible({
      timeout: 15_000,
    });
  });
});
