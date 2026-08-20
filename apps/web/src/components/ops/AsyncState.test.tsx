import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AsyncState } from "./AsyncState";
import { renderWithProviders } from "../../test-utils";

describe("AsyncState", () => {
  it("shows loading copy", () => {
    renderWithProviders({
      lang: "zh",
      children: <AsyncState loading />,
    });
    expect(screen.getByText("加载中…")).toBeInTheDocument();
  });

  it("shows error with retry", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    renderWithProviders({
      lang: "zh",
      children: <AsyncState error="boom" onRetry={onRetry} />,
    });
    expect(screen.getByText("boom")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /重试/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders children when idle", () => {
    renderWithProviders({
      children: (
        <AsyncState>
          <p>ready</p>
        </AsyncState>
      ),
    });
    expect(screen.getByText("ready")).toBeInTheDocument();
  });
});
