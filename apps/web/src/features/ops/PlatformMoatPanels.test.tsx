import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlatformMoatPanels } from "./PlatformMoatPanels";
import { renderWithProviders } from "../../test-utils";
import { DomainPackProvider } from "../../contexts/DomainPackContext";
import { isLiveOpsPack, resolvePackBySlug } from "../../lib/domain-packs";
import type { AdminDomainPackCatalogEntry } from "../../api";
import type { PilotBaseline } from "../../api";
import type { ReactNode } from "react";

const mockApi = vi.hoisted(() => ({
  fetchPilotBaseline: vi.fn<() => Promise<{ baseline: PilotBaseline | null }>>(),
  savePilotBaseline: vi.fn<
    (patch: {
      manual_run_shed_count_per_week?: number;
      notes?: string;
    }) => Promise<{ baseline: PilotBaseline }>
  >(),
}));

vi.mock("../../api", () => mockApi);
vi.mock("./PilotRoiPanel", () => ({
  PilotRoiPanel: () => <div data-testid="pilot-roi-panel">PilotRoiPanel</div>,
}));
vi.mock("./IntentFailuresPanel", () => ({
  IntentFailuresPanel: () => <div data-testid="intent-failures-panel">IntentFailuresPanel</div>,
}));

const pack = (() => {
  const meta = resolvePackBySlug("greenhouse")!;
  if (!isLiveOpsPack(meta)) throw new Error("expected a live pack");
  return meta;
})();

function makeCatalog(satellite = true): AdminDomainPackCatalogEntry[] {
  return [
    {
      id: "agriculture",
      display_name: "农场工长",
      status: "live",
      active: true,
      capabilities: satellite ? { satellite: true } : undefined,
    },
  ];
}

function renderWithDomainPack(children: ReactNode, satellite = true) {
  return renderWithProviders({
    initialEntries: ["/scenes/greenhouse/ops/platform"],
    lang: "en",
    children: (
      <DomainPackProvider
        pack={pack}
        catalog={makeCatalog(satellite)}
        activeDomain="agriculture"
      >
        {children}
      </DomainPackProvider>
    ),
  });
}

const baselineFixture: PilotBaseline = {
  deployment_id: "dep-1",
  manual_run_shed_count_per_week: 3,
  notes: "current baseline",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("PlatformMoatPanels", () => {
  beforeEach(() => {
    mockApi.fetchPilotBaseline.mockReset();
    mockApi.savePilotBaseline.mockReset();
  });

  it("shows pilot baseline form and ROI panel when pack has satellite capability", async () => {
    mockApi.fetchPilotBaseline.mockResolvedValue({ baseline: baselineFixture });

    renderWithDomainPack(<PlatformMoatPanels />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Pilot baseline/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("spinbutton")).toHaveValue(3);
    expect(screen.getByTestId("pilot-roi-panel")).toBeInTheDocument();
    expect(screen.getByTestId("intent-failures-panel")).toBeInTheDocument();
  });

  it("hides baseline and ROI when pack lacks satellite capability", () => {
    renderWithDomainPack(<PlatformMoatPanels />, false);

    expect(screen.queryByRole("heading", { name: /Pilot baseline/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("pilot-roi-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("intent-failures-panel")).toBeInTheDocument();
  });

  it("does not fetch baseline when satellite capability is absent", () => {
    renderWithDomainPack(<PlatformMoatPanels />, false);

    expect(mockApi.fetchPilotBaseline).not.toHaveBeenCalled();
  });

  it("saves baseline and updates the form value", async () => {
    const user = userEvent.setup();
    mockApi.fetchPilotBaseline.mockResolvedValue({ baseline: null });
    mockApi.savePilotBaseline.mockResolvedValue({
      baseline: { ...baselineFixture, manual_run_shed_count_per_week: 5 },
    });

    renderWithDomainPack(<PlatformMoatPanels />);

    await waitFor(() => {
      expect(screen.getByRole("spinbutton")).toBeInTheDocument();
    });

    await user.clear(screen.getByRole("spinbutton"));
    await user.type(screen.getByRole("spinbutton"), "5");
    await user.type(screen.getByLabelText(/Notes/i), "updated notes");
    await user.click(screen.getByRole("button", { name: /Save baseline/i }));

    await waitFor(() => {
      expect(screen.getByText(/Baseline saved/i)).toBeInTheDocument();
    });
    expect(mockApi.savePilotBaseline).toHaveBeenCalledWith({
      manual_run_shed_count_per_week: 5,
      notes: "updated notes",
    });
    expect(screen.getByRole("spinbutton")).toHaveValue(5);
  });

  it("shows an error banner when baseline fetch fails", async () => {
    mockApi.fetchPilotBaseline.mockRejectedValue(new Error("baseline unavailable"));

    renderWithDomainPack(<PlatformMoatPanels />);

    await waitFor(() => {
      expect(screen.getByText(/baseline unavailable/i)).toBeInTheDocument();
    });
  });

  it("shows an error banner when baseline save fails", async () => {
    const user = userEvent.setup();
    mockApi.fetchPilotBaseline.mockResolvedValue({ baseline: null });
    mockApi.savePilotBaseline.mockRejectedValue(new Error("save failed"));

    renderWithDomainPack(<PlatformMoatPanels />);

    await waitFor(() => {
      expect(screen.getByRole("spinbutton")).toBeInTheDocument();
    });

    await user.type(screen.getByRole("spinbutton"), "2");
    await user.click(screen.getByRole("button", { name: /Save baseline/i }));

    await waitFor(() => {
      expect(screen.getByText(/save failed/i)).toBeInTheDocument();
    });
  });
});
