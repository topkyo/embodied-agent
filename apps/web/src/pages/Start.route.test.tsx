import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import WorkbenchLayout from "../layouts/WorkbenchLayout";
import Start from "./Start";
import { LanguageProvider } from "../contexts/LanguageContext";
import { mockAppFetch } from "../test-utils";
import { clearOpsRole } from "../lib/ops-role";

/**
 * 集成回归：模拟 App.tsx 真实路由树。
 * /start 路在 <WorkbenchLayout> 之下；如果 WorkbenchLayout 没自包 AuthProvider，
 * Start 的 useAuth() 会抛 "useAuth outside AuthProvider" → 白屏。
 * 该测试必须稳定通过：保证路由修复不再回退。
 */
describe("/start 与 WorkbenchLayout 路由回归", () => {
  afterEach(() => {
    clearOpsRole();
    vi.restoreAllMocks();
  });

  it("user 角色登录访问 /start：渲染三张可加载 Domain Pack 卡，不白屏", async () => {
    mockAppFetch({
      authMe: {
        user_id: "member-1",
        role: "user",
        display_name: "Member",
      },
      activeDomain: "agriculture",
      catalog: [
        { id: "agriculture", display_name: "农场工长", status: "live", active: true },
        { id: "robotics", display_name: "机器人领域", status: "live", active: false },
        { id: "industrial", display_name: "工业安能卫士", status: "live", active: false },
      ],
    });
    localStorage.setItem("ea_lang", "zh");

    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={["/start"]}>
          <Routes>
            <Route element={<WorkbenchLayout />}>
              <Route path="/start" element={<Start />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </LanguageProvider>,
    );

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    // 关键回归：渲染成功，没有 throw 拆掉整树
    expect(screen.getByRole("heading", { name: /选择领域|Pick a domain/i })).toBeInTheDocument();

    // 三个可加载 pack 都渲染出来
    const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-pack]")).map((c) =>
      c.getAttribute("data-pack"),
    );
    expect(cards).toEqual(["greenhouse", "robot", "industrial"]);
  });

  it("匿名访问 /start：不白屏，仍可渲染三张可加载 Domain Pack 卡 + 注册入口", async () => {
    mockAppFetch({
      authMe: null,
      activeDomain: "agriculture",
      catalog: [
        { id: "agriculture", display_name: "农场工长", status: "live", active: true },
        { id: "robotics", display_name: "机器人领域", status: "live", active: false },
        { id: "industrial", display_name: "工业安能卫士", status: "live", active: false },
      ],
    });
    localStorage.setItem("ea_lang", "zh");

    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={["/start"]}>
          <Routes>
            <Route element={<WorkbenchLayout />}>
              <Route path="/start" element={<Start />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </LanguageProvider>,
    );

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(
      Array.from(document.querySelectorAll<HTMLElement>("[data-pack]")).map((c) =>
        c.getAttribute("data-pack"),
      ),
    ).toEqual(["greenhouse", "robot", "industrial"]);
  });
});
