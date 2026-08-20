import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { PendingConfirmView } from "../../../api/settings";
import { renderWithProviders } from "../../../test-utils";
import { PendingConfirmsPanel } from "./PendingConfirmsPanel";

const NOW = 1_700_000_000_000;

const pendingItems: PendingConfirmView[] = [
  {
    user_id: "u1",
    created_at: NOW - 60_000,
    expires_at: NOW + 90_000,
    action_summary: "Open vents",
    target_summary: "gh-001",
  },
];

describe("PendingConfirmsPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows empty state copy when there are no pending items", () => {
    renderWithProviders({
      lang: "en",
      children: <PendingConfirmsPanel items={[]} />,
    });

    expect(screen.getByText("No actions waiting for confirmation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reply in WeChat to confirm/i })).toHaveAttribute(
      "href",
      "/start",
    );
  });

  it("renders pending rows when items are present", () => {
    renderWithProviders({
      lang: "en",
      children: <PendingConfirmsPanel items={pendingItems} />,
    });

    expect(screen.getByText("Open vents")).toBeInTheDocument();
    expect(screen.getByText("gh-001")).toBeInTheDocument();
    expect(screen.getByText("01:30 remaining")).toBeInTheDocument();
    expect(screen.getAllByTestId("pending-confirm-row")).toHaveLength(1);
  });

  it("does not render confirm or reject action buttons", () => {
    renderWithProviders({
      lang: "en",
      children: <PendingConfirmsPanel items={pendingItems} />,
    });

    expect(
      screen.queryByRole("button", { name: /确认|reject|confirm/i }),
    ).not.toBeInTheDocument();
  });
});
