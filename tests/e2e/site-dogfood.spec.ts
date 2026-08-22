import { test, expect } from "@playwright/test";

const SITE_BASE = process.env.E2E_SITE_URL ?? "http://127.0.0.1:5170";

/**
 * 营销文案 headline 不进 PR @critical（避免 copy 改动绑架门禁注意力）。
 * PR 仍靠 site-smoke 路由可达；本文件在 nightly 全量跑。
 */
test.describe("site dogfood", () => {
  test.use({ baseURL: SITE_BASE });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("ea_lang", "en");
    });
  });

  test("pet explore scene renders heading", async ({ page }) => {
    await page.goto("/scenes/pet");
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("aquaculture marketing scene renders heading", async ({ page }) => {
    await page.goto("/scenes/aquaculture");
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("coldchain planned scene renders heading", async ({ page }) => {
    await page.goto("/scenes/coldchain");
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("elderly explore scene renders heading", async ({ page }) => {
    await page.goto("/scenes/elderly");
    await expect(page.getByRole("heading").first()).toBeVisible();
  });
});
