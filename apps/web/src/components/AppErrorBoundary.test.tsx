import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppErrorBoundary from "./AppErrorBoundary";

describe("AppErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <AppErrorBoundary>
        <div data-testid="ok">ok</div>
      </AppErrorBoundary>,
    );
    expect(screen.getByTestId("ok")).toBeInTheDocument();
  });

  it("renders fallback and shows error message on thrown render", () => {
    function Boom(): never {
      throw new Error("useAuth outside AuthProvider");
    }
    render(
      <MemoryRouter>
        <AppErrorBoundary>
          <Boom />
        </AppErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /工作台初始化失败/i })).toBeInTheDocument();
    expect(screen.getByText(/useAuth outside AuthProvider/i)).toBeInTheDocument();
    const startLink = screen.getByRole("link", { name: /回到领域选择/i });
    expect(startLink.getAttribute("href")).toBe("/start");
  });
});
