import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PolicySuggestionsPanel } from "./PolicySuggestionsPanel";
import { renderWithProviders } from "../../test-utils";
import type { PolicySuggestionRow } from "../../api";

const fetchPolicySuggestions = vi.fn();
const applyPolicySuggestionAdmin = vi.fn();

vi.mock("../../api", () => ({
  fetchPolicySuggestions: () => fetchPolicySuggestions(),
  applyPolicySuggestionAdmin: (...args: unknown[]) => applyPolicySuggestionAdmin(...args),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const pendingSuggestions: PolicySuggestionRow[] = [
  {
    id: "sug-1",
    deployment_id: "dep-1",
    kind: "threshold",
    scene_skill_id: "post_irrigation_ventilation",
    status: "pending",
    created_at: "2026-07-01T00:00:00.000Z",
    reason: "Raise humidity threshold after irrigation",
  },
  {
    id: "sug-2",
    deployment_id: "dep-1",
    kind: "threshold",
    status: "pending",
    created_at: "2026-07-02T00:00:00.000Z",
    reason: "Lower temperature alert for heat wave",
  },
];

describe("PolicySuggestionsPanel", () => {
  it("shows an empty message when there are no pending suggestions", async () => {
    fetchPolicySuggestions.mockResolvedValue({ suggestions: [] });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/review"],
      lang: "en",
      children: <PolicySuggestionsPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("No pending suggestions")).toBeInTheDocument();
    });
  });

  it("renders only pending suggestions", async () => {
    fetchPolicySuggestions.mockResolvedValue({
      suggestions: [
        ...pendingSuggestions,
        {
          id: "sug-3",
          deployment_id: "dep-1",
          kind: "threshold",
          status: "applied",
          created_at: "2026-07-03T00:00:00.000Z",
          reason: "Already applied",
        },
      ],
    });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/review"],
      lang: "en",
      children: <PolicySuggestionsPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("Raise humidity threshold after irrigation")).toBeInTheDocument();
    });
    expect(screen.getByText("Lower temperature alert for heat wave")).toBeInTheDocument();
    expect(screen.queryByText("Already applied")).not.toBeInTheDocument();
  });

  it("applies a suggestion and reloads the list", async () => {
    const user = userEvent.setup();
    fetchPolicySuggestions
      .mockResolvedValueOnce({ suggestions: pendingSuggestions })
      .mockResolvedValueOnce({ suggestions: [pendingSuggestions[1]] });
    applyPolicySuggestionAdmin.mockResolvedValue({ ok: true, suggestion: pendingSuggestions[0] });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/review"],
      lang: "en",
      children: <PolicySuggestionsPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("Raise humidity threshold after irrigation")).toBeInTheDocument();
    });

    const firstSuggestion = screen.getByText("Raise humidity threshold after irrigation").closest("li") as HTMLElement;
    await user.click(within(firstSuggestion).getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(applyPolicySuggestionAdmin).toHaveBeenCalledWith("sug-1");
    });
    await waitFor(() => {
      expect(screen.getByText("Applied")).toBeInTheDocument();
    });
    expect(fetchPolicySuggestions.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("displays a load error when fetching fails", async () => {
    fetchPolicySuggestions.mockRejectedValue(new Error("load failed"));

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/review"],
      lang: "en",
      children: <PolicySuggestionsPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("load failed")).toBeInTheDocument();
    });
  });

  it("displays an apply error without crashing", async () => {
    const user = userEvent.setup();
    fetchPolicySuggestions.mockResolvedValue({ suggestions: pendingSuggestions });
    applyPolicySuggestionAdmin.mockRejectedValue(new Error("apply failed"));

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/review"],
      lang: "en",
      children: <PolicySuggestionsPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("Raise humidity threshold after irrigation")).toBeInTheDocument();
    });

    const firstSuggestion = screen.getByText("Raise humidity threshold after irrigation").closest("li") as HTMLElement;
    await user.click(within(firstSuggestion).getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(screen.getByText("apply failed")).toBeInTheDocument();
    });
  });
});
