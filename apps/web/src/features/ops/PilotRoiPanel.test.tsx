import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { PilotRoiPanel } from "./PilotRoiPanel";
import { renderWithProviders } from "../../test-utils";
import type { PilotRoiSummary } from "../../api";

const fetchPilotRoi = vi.fn();

vi.mock("../../api", () => ({
  fetchPilotRoi: (...args: unknown[]) => fetchPilotRoi(...args),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const roiSummary: PilotRoiSummary = {
  deployment_id: "dep-1",
  baseline_runs_per_week: 12,
  scene_total: 7,
  scene_success_count: 6,
  estimated_runs_saved: 4,
  summary_text: "Pilot saved an estimated 4 manual runs this week.",
};

describe("PilotRoiPanel", () => {
  it("shows a loading state before data arrives", () => {
    fetchPilotRoi.mockReturnValue(new Promise(() => {}));

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/platform"],
      lang: "en",
      children: <PilotRoiPanel />,
    });

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders the ROI summary when available", async () => {
    fetchPilotRoi.mockResolvedValue(roiSummary);

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/platform"],
      lang: "en",
      children: <PilotRoiPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("Pilot saved an estimated 4 manual runs this week.")).toBeInTheDocument();
    });
  });

  it("displays an error when fetching ROI fails", async () => {
    fetchPilotRoi.mockRejectedValue(new Error("roi unavailable"));

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/platform"],
      lang: "en",
      children: <PilotRoiPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("roi unavailable")).toBeInTheDocument();
    });
  });
});
