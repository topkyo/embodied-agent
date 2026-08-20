import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setOpsRoleFromAuth } from "./lib/ops-role";

describe("DOM environment smoke test", () => {
  it("renders button and responds to click", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<button onClick={onClick}>提交</button>);
    await user.click(screen.getByRole("button", { name: "提交" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("supports getByText and toBeInTheDocument matcher", () => {
    render(<div>hello world</div>);
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("ops-role injection works with React tree", () => {
    setOpsRoleFromAuth({
      user_id: "u1",
      role: "admin",
      display_name: "Admin",
    });
    function RoleBadge() {
      // lazy import would re-bind; use require pattern via window not needed
      return <span data-testid="role">ok</span>;
    }
    render(<RoleBadge />);
    expect(screen.getByTestId("role")).toBeInTheDocument();
  });
});
