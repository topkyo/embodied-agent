import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import SceneOpsPlatformGate from "./SceneOpsPlatformGate";
import { mockAppFetch, renderWithProviders, setOpsRoleFromAuth } from "../../test-utils";

vi.mock("./SceneOpsPlatform", () => ({
  default: () => <div data-testid="platform-console">platform</div>,
}));

describe("SceneOpsPlatformGate", () => {
  it("shows admin denial for user session — primary CTA directs back to scene ops, not /login", async () => {
    mockAppFetch({
      authMe: { user_id: "u1", role: "user", display_name: "U" },
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/platform"],
      lang: "en",
      children: (
        <Routes>
          <Route path="/scenes/:packSlug/ops/platform" element={<SceneOpsPlatformGate />} />
        </Routes>
      ),
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Admin access required/i })).toBeInTheDocument();
    });
    expect(screen.queryByTestId("platform-console")).not.toBeInTheDocument();

    // 已登录但非 admin → primary CTA 「返回场景工作台 / Back to scene ops」 指向 pack.opsPath，不被误导去 /login
    const primaryCta = screen.getByRole("link", { name: /Back to scene ops/i });
    expect(primaryCta).toHaveAttribute("href", "/scenes/greenhouse/ops");
    // 「去登录」 这个指向 /login 的 CTA 在非 admin 已登录 场景不应出现
    expect(screen.queryByRole("link", { name: /^Sign in$/i })).toBeNull();
  });

  it("renders platform console for admin", async () => {
    mockAppFetch({
      authMe: { user_id: "a1", role: "admin", display_name: "A" },
    });
    setOpsRoleFromAuth({ user_id: "a1", role: "admin", display_name: "A" });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/platform"],
      lang: "en",
      children: (
        <Routes>
          <Route path="/scenes/:packSlug/ops/platform" element={<SceneOpsPlatformGate />} />
        </Routes>
      ),
    });

    await waitFor(() => {
      expect(screen.getByTestId("platform-console")).toBeInTheDocument();
    });
  });

  it("anonymous: redirect to /login via Navigate, 不再渲染 「需要管理员」 disabled shell", async () => {
    mockAppFetch({ authMe: null });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/platform"],
      lang: "en",
      children: (
        <Routes>
          <Route path="/scenes/:packSlug/ops/platform" element={<SceneOpsPlatformGate />} />
          <Route path="/login" element={<div data-testid="login-reached">login</div>} />
        </Routes>
      ),
    });

    // 工作台 Layout 顶栏登录 link提供的、`/login` 是 WorkbenchLayout-outlet 唯一入口；
    // SceneOpsPlatformGate 在匿名情况下 Navigate 到 /login state.from 携带原路径。
    await waitFor(() => {
      expect(screen.getByTestId("login-reached")).toBeInTheDocument();
    });
    // 不会再 render 「Scene ops not available yet」disabled shell
    expect(screen.queryByRole("heading", { name: /Scene ops not available yet/i })).toBeNull();
  });
});
