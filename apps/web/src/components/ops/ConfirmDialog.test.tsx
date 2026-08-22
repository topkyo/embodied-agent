import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./ConfirmDialog";
import { renderWithProviders } from "../../test-utils";

describe("ConfirmDialog", () => {
  it("does not render when closed", () => {
    renderWithProviders({
      lang: "en",
      children: (
        <ConfirmDialog
          open={false}
          title="Confirm"
          message="Delete?"
          confirmLabel="OK"
          cancelLabel="Cancel"
          onConfirm={() => undefined}
          onCancel={() => undefined}
        />
      ),
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("calls onConfirm / onCancel", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders({
      lang: "en",
      children: (
        <ConfirmDialog
          open
          title="Confirm delete"
          message="Remove user u-1?"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          danger
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      ),
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Remove user u-1?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
