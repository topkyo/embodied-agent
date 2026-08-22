import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "../contexts/LanguageContext";
import { AuthProvider } from "../contexts/AuthContext";
import { mockAppFetch } from "../test-utils";
import Login from "./Login";
import { clearOpsRole, setOpsRoleFromAuth } from "../lib/ops-role";

function mockAuthRoutes() {
  let signedIn:
    | { user_id: string; role: "admin" | "user"; display_name: string }
    | null = null;
  return mockAppFetch({
    authMe: null,
    routes: [
      (url) => {
        if (url.includes("/auth/me")) {
          if (!signedIn) {
            return new Response(JSON.stringify({ error: "unauthenticated" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify(signedIn), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/auth/email")) {
          signedIn = {
            user_id: "u-admin-1",
            role: "admin",
            display_name: "Admin",
          };
          return new Response(JSON.stringify(signedIn), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/auth/bootstrap-status")) {
          return new Response(JSON.stringify({ available: false, redeemed: false }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return undefined;
      },
    ],
  });
}

type Entry = string | { pathname: string; state?: unknown };

function renderLogin(initialEntries: Entry[]) {
  localStorage.setItem("ea_lang", "zh");
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/start" element={<div data-testid="start-marker">start-marker</div>} />
            <Route
              path="/scenes/greenhouse/ops"
              element={<div data-testid="ops-marker">ops-marker</div>}
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

describe("Login routing", () => {
  afterEach(() => {
    clearOpsRole();
    vi.restoreAllMocks();
  });

  it("无 state.from：back link → /start，提交后跳 /start", async () => {
    mockAuthRoutes();
    const user = userEvent.setup();
    const view = renderLogin(["/login"]);

    const back = await screen.findByText(/返回\s*领域\s*选择/i);
    expect(back.closest("a")?.getAttribute("href")).toBe("/start");

    await user.type(screen.getByLabelText(/邮箱/i), "admin@example.com");
    await user.type(screen.getByLabelText(/密码/i), "password1234");
    await user.click(screen.getByRole("button", { name: /^登录$/ }));

    await waitFor(() => {
      expect(view.container.querySelector('[data-testid="start-marker"]')).toBeTruthy();
    });
  });

  it("state.from = /scenes/greenhouse/ops：保留 ops 路径，不回 /start", async () => {
    mockAuthRoutes();
    const user = userEvent.setup();
    const view = renderLogin([{ pathname: "/login", state: { from: "/scenes/greenhouse/ops" } }]);

    const back = await screen.findByText(/返回\s*领域\s*选择/i);
    expect(back.closest("a")?.getAttribute("href")).toBe("/start");

    await user.type(screen.getByLabelText(/邮箱/i), "admin@example.com");
    await user.type(screen.getByLabelText(/密码/i), "password1234");
    await user.click(screen.getByRole("button", { name: /^登录$/ }));

    await waitFor(() => {
      expect(view.container.querySelector('[data-testid="ops-marker"]')).toBeTruthy();
    });
    expect(view.container.querySelector('[data-testid="start-marker"]')).toBeNull();
  });

  it("已有 session：进入 /login 直接跳 /start，无需再点登录", async () => {
    mockAppFetch({
      authMe: { user_id: "u-admin-1", role: "admin", display_name: "Admin" },
      routes: [
        (url) => {
          if (url.includes("/auth/bootstrap-status")) {
            return new Response(JSON.stringify({ available: false, redeemed: false }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return undefined;
        },
      ],
    });
    setOpsRoleFromAuth({ user_id: "u-admin-1", role: "admin", display_name: "Admin" });
    const view = renderLogin(["/login"]);

    await waitFor(() => {
      expect(view.container.querySelector('[data-testid="start-marker"]')).toBeTruthy();
    });
  });
});
