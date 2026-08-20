import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import RequireAuth from "./RequireAuth";
import { mockAppFetch, renderWithProviders, setOpsRoleFromAuth } from "../test-utils";

describe("RequireAuth", () => {
  it("redirects to /login when unauthenticated", async () => {
    mockAppFetch({ authMe: null });
    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops"],
      lang: "en",
      children: (
        <Routes>
          <Route
            path="/scenes/:packSlug/ops"
            element={
              <RequireAuth>
                <div data-testid="protected">secret</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">login</div>} />
        </Routes>
      ),
    });

    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("protected")).not.toBeInTheDocument();
  });

  it("renders children when session present", async () => {
    mockAppFetch({
      authMe: { user_id: "u1", role: "user", display_name: "U" },
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });
    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops"],
      lang: "en",
      children: (
        <Routes>
          <Route
            path="/scenes/:packSlug/ops"
            element={
              <RequireAuth>
                <div data-testid="protected">secret</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">login</div>} />
        </Routes>
      ),
    });

    await waitFor(() => {
      expect(screen.getByTestId("protected")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
  });
});
