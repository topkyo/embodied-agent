import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import SceneOpsLayout from "./SceneOpsLayout";
import { mockAppFetch, renderWithProviders, setOpsRoleFromAuth } from "../test-utils";
import { jsonResponse } from "../test-utils/fetch";

vi.mock("../components/LangSwitcher", () => ({
  default: () => <span data-testid="lang-switcher" />,
}));
vi.mock("../components/scene-ops/SceneOpsReadinessBadge", () => ({
  SceneOpsReadinessBadge: () => <span data-testid="readiness-badge" />,
}));
/** 避免 admin 路径下 readiness fetch 对残缺 body 调用 .find 崩掉整树 */
vi.mock("../contexts/SceneOpsReadinessContext", () => ({
  SceneOpsReadinessProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSceneOpsReadiness: () => ({
    loading: false,
    error: null,
    data: null,
    blockingIssue: null,
    ready: true,
    blocked: false,
    refresh: () => {},
  }),
}));

describe("SceneOpsLayout nav / disabled shell", () => {
  it("shows disabled shell for placeholder pack (aquaculture)", async () => {
    mockAppFetch({
      authMe: { user_id: "u1", role: "user", display_name: "U" },
      activeDomain: "agriculture",
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });

    renderWithProviders({
      initialEntries: ["/scenes/aquaculture/ops"],
      lang: "en",
      children: (
        <Routes>
          <Route path="/scenes/:packSlug/ops" element={<SceneOpsLayout />} />
        </Routes>
      ),
    });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Scene ops not available yet/i }),
      ).toBeInTheDocument();
    });
  });

  it("user nav omits Review / Platform / Settings / Users when active pack loads", async () => {
    mockAppFetch({
      authMe: { user_id: "u1", role: "user", display_name: "U" },
      activeDomain: "agriculture",
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops"],
      lang: "en",
      children: (
        <Routes>
          <Route path="/scenes/:packSlug/ops/*" element={<SceneOpsLayout />}>
            <Route index element={<div data-testid="overview-slot" />} />
          </Route>
        </Routes>
      ),
    });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Overview/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: /^Review$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Platform base/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Settings$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Users$/i })).not.toBeInTheDocument();
    // user 仅运行面；配置面/系统面不出现
    expect(screen.getByRole("button", { name: /^run$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^config$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^system$/i })).not.toBeInTheDocument();
  });

  it("admin nav includes Platform base and Review when active pack loads", async () => {
    // 不拦截 /admin/domain-packs，走 mockAppFetch 默认完整 fixture → 无 ops schema 时用 legacy 导航
    mockAppFetch({
      authMe: { user_id: "a1", role: "admin", display_name: "A" },
      activeDomain: "agriculture",
      routes: [
        (url) => {
          if (url.includes("/admin/domain-packs")) return null;
          if (url.includes("/admin/")) {
            return jsonResponse({});
          }
          return null;
        },
      ],
    });
    setOpsRoleFromAuth({ user_id: "a1", role: "admin", display_name: "A" });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops"],
      lang: "en",
      children: (
        <Routes>
          <Route path="/scenes/:packSlug/ops/*" element={<SceneOpsLayout />}>
            <Route index element={<div data-testid="overview-slot" />} />
          </Route>
        </Routes>
      ),
    });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Platform base/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /^Review$/i })).toBeInTheDocument();
    // Phase 2.1：admin 三面分组标签
    expect(screen.getByRole("button", { name: /^run$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^config$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^system$/i })).toBeInTheDocument();
  });

  it("admin nav groups Review under run and Platform under system", async () => {
    mockAppFetch({
      authMe: { user_id: "a1", role: "admin", display_name: "A" },
      activeDomain: "agriculture",
      routes: [
        (url) => {
          if (url.includes("/admin/domain-packs")) return null;
          if (url.includes("/admin/")) return jsonResponse({});
          return null;
        },
      ],
    });
    setOpsRoleFromAuth({ user_id: "a1", role: "admin", display_name: "A" });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops"],
      lang: "en",
      children: (
        <Routes>
          <Route path="/scenes/:packSlug/ops/*" element={<SceneOpsLayout />}>
            <Route index element={<div data-testid="overview-slot" />} />
          </Route>
        </Routes>
      ),
    });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /^Review$/i })).toBeInTheDocument();
    });

    const runGroup = document.querySelector('.console-nav-group[data-group="run"]');
    const configGroup = document.querySelector('.console-nav-group[data-group="config"]');
    const systemGroup = document.querySelector('.console-nav-group[data-group="system"]');
    expect(runGroup?.textContent).toMatch(/Overview/i);
    expect(runGroup?.textContent).toMatch(/Devices/i);
    expect(runGroup?.textContent).toMatch(/Review/i);
    expect(configGroup?.textContent).toMatch(/Scene settings/i);
    expect(configGroup?.textContent).toMatch(/Users/i);
    expect(systemGroup?.textContent).toMatch(/Platform base/i);
  });

  it("shows pack name once in topbar and short Bind WeChat CTA", async () => {
    mockAppFetch({
      authMe: { user_id: "u1", role: "user", display_name: "U" },
      activeDomain: "agriculture",
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops"],
      lang: "en",
      children: (
        <Routes>
          <Route path="/scenes/:packSlug/ops/*" element={<SceneOpsLayout />}>
            <Route index element={<div data-testid="overview-slot" />} />
          </Route>
        </Routes>
      ),
    });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Overview/i })).toBeInTheDocument();
    });

    // P4-5: pack display name only in topbar title (not duplicated as sidebar header)
    const packTitle = document.querySelector(".ops-console-topbar-title");
    expect(packTitle).toBeTruthy();
    expect(packTitle).toHaveTextContent(/Farm Steward/i);
    expect(document.querySelector(".console-sidebar-pack")).toBeNull();

    const topbar = document.querySelector(".ops-console-topbar");
    const actions = document.querySelector(".ops-console-topbar-actions");
    expect(topbar?.querySelector('[data-testid="readiness-badge"]')).toBeTruthy();
    expect(actions?.querySelector('[data-testid="readiness-badge"]')).toBeNull();

    // Phase 1: 「返回领域」 → /start（桌面顶栏 + 窄屏抽屉脚各一处，href 一致）
    const backLinks = screen.getAllByRole("link", { name: /Back to domains|返回领域/i });
    expect(backLinks.length).toBeGreaterThanOrEqual(1);
    for (const link of backLinks) {
      expect(link).toHaveAttribute("href", "/start");
    }
    expect(screen.queryByRole("link", { name: /Bind WeChat|绑定微信/i })).toBeNull();

    // Brand (icon + title) → marketing site, same as WorkbenchLayout
    const brand = screen.getByRole("link", { name: /Back to product site home|返回产品站首页/i });
    expect(brand.getAttribute("href")).toMatch(/5170|^\//);
    expect(brand.querySelector(".brand-mark")).toBeTruthy();

    // Narrow secondary actions also mounted in drawer foot (shown via CSS ≤860)
    expect(screen.getByTestId("ops-unbind-drawer")).toBeInTheDocument();
    expect(document.querySelector(".ops-console-sidebar-secondary")).toBeTruthy();
  });
});

describe("SceneOpsLayout ops-unbind confirm-modal flow", () => {
  it("topbar shows 「Unbind WeChat and sign out」 label, confirm opens modal", async () => {
    mockAppFetch({
      authMe: { user_id: "u1", role: "user", display_name: "U" },
      activeDomain: "agriculture",
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops"],
      lang: "en",
      children: (
        <Routes>
          <Route path="/scenes/:packSlug/ops/*" element={<SceneOpsLayout />}>
            <Route index element={<div data-testid="overview-slot" />} />
            <Route path="login-reached" element={<div data-testid="login-reached" />} />
          </Route>
        </Routes>
      ),
    });

    await waitFor(() => {
      expect(screen.getByTestId("ops-unbind-topbar")).toBeInTheDocument();
    });
    expect(screen.getByTestId("ops-unbind-topbar")).toHaveTextContent(
      /Unbind WeChat and sign out/i,
    );

    await userEvent.setup().click(screen.getByTestId("ops-unbind-topbar"));

    // confirm dialog opens, danger action
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Unbind and sign out/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
  });

  it("confirm executes unbind + logout + navigate /login", async () => {
    let unbindCalled = false;
    let logoutCalled = false;
    mockAppFetch({
      authMe: { user_id: "u1", role: "user", display_name: "U" },
      activeDomain: "agriculture",
      routes: [
        (url, init) => {
          if (
            url.includes("/admin/wechat/binding") &&
            (init?.method ?? "GET").toUpperCase() === "DELETE"
          ) {
            unbindCalled = true;
            return jsonResponse({
              ok: true,
              removed: true,
              was_connected: true,
              principal_user_id: "u1",
            });
          }
          if (url.includes("/auth/logout") && (init?.method ?? "GET").toUpperCase() === "POST") {
            logoutCalled = true;
            return jsonResponse({ ok: true });
          }
          return null;
        },
      ],
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops"],
      lang: "en",
      children: (
        <Routes>
          <Route path="/login" element={<div data-testid="login-reached" />} />
          <Route path="/scenes/:packSlug/ops/*" element={<SceneOpsLayout />}>
            <Route index element={<div data-testid="overview-slot" />} />
          </Route>
        </Routes>
      ),
    });

    await waitFor(() => {
      expect(screen.getByTestId("ops-unbind-topbar")).toBeInTheDocument();
    });

    await userEvent.setup().click(screen.getByTestId("ops-unbind-topbar"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    await userEvent.setup().click(screen.getByRole("button", { name: /Unbind and sign out/i }));

    await waitFor(() => {
      expect(screen.getByTestId("login-reached")).toBeInTheDocument();
    });
    expect(unbindCalled).toBe(true);
    expect(logoutCalled).toBe(true);
  });

  it("cancel closes confirm modal without invoking unbind API", async () => {
    let unbindCalled = false;
    mockAppFetch({
      authMe: { user_id: "u1", role: "user", display_name: "U" },
      activeDomain: "agriculture",
      routes: [
        (url, init) => {
          if (
            url.includes("/admin/wechat/binding") &&
            (init?.method ?? "GET").toUpperCase() === "DELETE"
          ) {
            unbindCalled = true;
            return jsonResponse({
              ok: true,
              removed: true,
              was_connected: true,
              principal_user_id: "u1",
            });
          }
          return null;
        },
      ],
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops"],
      lang: "en",
      children: (
        <Routes>
          <Route path="/scenes/:packSlug/ops/*" element={<SceneOpsLayout />}>
            <Route index element={<div data-testid="overview-slot" />} />
          </Route>
        </Routes>
      ),
    });

    await waitFor(() => {
      expect(screen.getByTestId("ops-unbind-topbar")).toBeInTheDocument();
    });

    await userEvent.setup().click(screen.getByTestId("ops-unbind-topbar"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    await userEvent.setup().click(screen.getByRole("button", { name: /Cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(unbindCalled).toBe(false);
  });
});
