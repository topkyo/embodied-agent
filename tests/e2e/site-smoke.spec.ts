import { test, expect } from "@playwright/test";

const SITE_BASE = process.env.E2E_SITE_URL ?? "http://127.0.0.1:5170";

const ROUTES = [
  { path: "/", name: "home" },
  { path: "/nodes", name: "nodes" },
  { path: "/scenes", name: "scenes list" },
  { path: "/scenes/greenhouse", name: "greenhouse scene" },
  { path: "/scenes/robot", name: "robot scene" },
  { path: "/scenes/industrial", name: "industrial scene" },
  { path: "/scenes/aquaculture", name: "aquaculture scene" },
  { path: "/scenes/coldchain", name: "coldchain scene" },
  { path: "/scenes/elderly", name: "elderly explore scene" },
  { path: "/scenes/pet", name: "pet explore scene" },
] as const;

test.describe("site smoke", () => {
  test.use({ baseURL: SITE_BASE });

  test("home page renders runtime hero", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    const title = page.locator("h1, h2").first();
    await expect(title).toBeVisible();
  });

  for (const route of ROUTES) {
    test(`${route.name} route is reachable`, async ({ page }) => {
      const res = await page.goto(route.path);
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator("body")).toBeVisible();
    });
  }

  test("greenhouse demo panel shows disclaimer", async ({ page }) => {
    await page.goto("/scenes/greenhouse#demo");
    await expect(page.locator("#demo .wechat-clawbot-panel .disclaimer")).toBeVisible();
  });

  test("mobile home and scenes list have no document horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const hasInFlowHorizontalOverflow = () =>
      page.evaluate(() => {
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

    for (const path of ["/", "/scenes"] as const) {
      await page.goto(path);
      expect(await hasInFlowHorizontalOverflow(), path).toBe(false);
    }
    await page.goto("/scenes");
    await expect(page.locator(".nav-links--segments")).toBeVisible();
    await expect(
      page.locator(".nav-links--segments a").filter({ hasText: /领域|Domains/ }),
    ).toBeVisible();
  });

  test("mobile topbar shows platform hardware domain segments", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const segments = page.locator(".nav-links--segments");
    await expect(segments).toBeVisible();
    await expect(segments.getByRole("link", { name: /平台|Platform/ })).toBeVisible();
    await expect(segments.getByRole("link", { name: /硬件|Hardware/ })).toBeVisible();
    await expect(segments.getByRole("link", { name: /领域|Domains/ })).toBeVisible();
    await expect(page.locator(".marketing-nav-drawer-toggle")).toHaveCount(0);
    await segments.getByRole("link", { name: /领域|Domains/ }).click();
    await expect(page).toHaveURL(/\/scenes/);
  });

  test("mobile EN topbar uses Ops short label without segment overlap", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?lang=en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const ops = page.locator(".nav-ops");
    await expect(ops).toBeVisible();
    await expect(ops.locator(".nav-label--short")).toHaveText("Ops");
    await expect(ops.locator(".nav-label--full")).toBeHidden();

    const overlap = await page.evaluate(() => {
      const domains = [...document.querySelectorAll(".nav-links--segments a")].find((a) =>
        /Domains/.test(a.textContent || ""),
      );
      const lang = document.querySelector(".lang-switcher--nav");
      if (!domains || !lang) return true;
      const a = domains.getBoundingClientRect();
      const b = lang.getBoundingClientRect();
      return !(
        a.right <= b.left + 1 ||
        b.right <= a.left + 1 ||
        a.bottom <= b.top + 1 ||
        b.bottom <= a.top + 1
      );
    });
    expect(overlap).toBe(false);
  });
});
