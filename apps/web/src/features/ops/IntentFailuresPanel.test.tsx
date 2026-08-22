import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntentFailuresPanel } from "./IntentFailuresPanel";
import { renderWithProviders } from "../../test-utils";
import type { IntentFailureRow, PromoteWechatResponse } from "../../api";

const mockApi = vi.hoisted(() => ({
  fetchIntentFailures: vi.fn<(opts?: { promoted?: boolean }) => Promise<{ cases: IntentFailureRow[]; total: number }>>(),
  promoteIntentFailureWechat: vi.fn<(id: string) => Promise<PromoteWechatResponse>>(),
  promoteAllIntentFailuresWechat: vi.fn<() => Promise<PromoteWechatResponse>>(),
}));

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return { ...actual, ...mockApi };
});

const baseCase: IntentFailureRow = {
  id: "f1",
  utterance: "open the vent",
  failure_kind: "skill_conflict",
  confidence: "high",
  promoted: false,
  platform: "wechat",
  flash_skill: undefined,
  pro_skill: undefined,
  expected_skill: undefined,
  recorded_at: "2026-07-10T08:30:00Z",
  promotable: true,
  raw_response_preview: "conflict",
};

const notPromotableCase: IntentFailureRow = {
  ...baseCase,
  id: "f2",
  utterance: "check status",
  promotable: false,
};

describe("IntentFailuresPanel", () => {
  beforeEach(() => {
    mockApi.fetchIntentFailures.mockReset();
    mockApi.promoteIntentFailureWechat.mockReset();
    mockApi.promoteAllIntentFailuresWechat.mockReset();
  });

  it("renders empty state when there are no pending failures", async () => {
    mockApi.fetchIntentFailures.mockResolvedValue({ cases: [], total: 0 });

    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <IntentFailuresPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText(/No pending failures/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders a table of failures with promotable actions", async () => {
    mockApi.fetchIntentFailures.mockResolvedValue({
      cases: [baseCase, notPromotableCase],
      total: 2,
    });

    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <IntentFailuresPanel />,
    });

    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });
    expect(screen.getByText("open the vent")).toBeInTheDocument();
    expect(screen.getByText("check status")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Promote wechat/i })).toHaveLength(1);
  });

  it("promotes a single failure and refreshes the list", async () => {
    const user = userEvent.setup();
    mockApi.fetchIntentFailures.mockResolvedValue({
      cases: [baseCase],
      total: 1,
    });
    mockApi.promoteIntentFailureWechat.mockResolvedValue({
      ok: true,
      promoted: 1,
      skipped: 0,
      failed: 0,
      results: [{ id: "f1", utterance: "open the vent", status: "promoted" }],
    });

    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <IntentFailuresPanel />,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Promote wechat/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Promote wechat/i }));

    await waitFor(() => {
      expect(screen.getByText(/Promoted 1 case/i)).toBeInTheDocument();
    });
    expect(mockApi.promoteIntentFailureWechat).toHaveBeenCalledWith("f1");
    expect(mockApi.fetchIntentFailures).toHaveBeenCalledTimes(2);
  });

  it("disables promote-all when no cases are promotable", async () => {
    mockApi.fetchIntentFailures.mockResolvedValue({
      cases: [notPromotableCase],
      total: 1,
    });

    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <IntentFailuresPanel />,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Promote all/i })).toBeDisabled();
    });
  });

  it("promotes all high-confidence failures and shows the result", async () => {
    const user = userEvent.setup();
    mockApi.fetchIntentFailures.mockResolvedValue({
      cases: [baseCase],
      total: 1,
    });
    mockApi.promoteAllIntentFailuresWechat.mockResolvedValue({
      ok: true,
      promoted: 2,
      skipped: 0,
      failed: 0,
      results: [
        { id: "f1", utterance: "open the vent", status: "promoted" },
        { id: "f2", utterance: "turn on fan", status: "promoted" },
      ],
    });

    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <IntentFailuresPanel />,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Promote all/i })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: /Promote all/i }));

    await waitFor(() => {
      expect(screen.getByText(/Promoted 2 case/i)).toBeInTheDocument();
    });
    expect(mockApi.promoteAllIntentFailuresWechat).toHaveBeenCalled();
    expect(mockApi.fetchIntentFailures).toHaveBeenCalledTimes(2);
  });

  it("shows an error banner when fetching failures fails", async () => {
    mockApi.fetchIntentFailures.mockRejectedValue(new Error("fetch failed"));

    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <IntentFailuresPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText(/fetch failed/i)).toBeInTheDocument();
    });
  });

  it("shows an error banner when promotion fails", async () => {
    const user = userEvent.setup();
    mockApi.fetchIntentFailures.mockResolvedValue({
      cases: [baseCase],
      total: 1,
    });
    mockApi.promoteIntentFailureWechat.mockRejectedValue(new Error("promote failed"));

    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <IntentFailuresPanel />,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Promote wechat/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Promote wechat/i }));

    await waitFor(() => {
      expect(screen.getByText(/promote failed/i)).toBeInTheDocument();
    });
  });
});
