import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlatformReadinessPanel } from "./PlatformReadinessPanel";
import { renderWithProviders } from "../../test-utils";
import { DomainPackProvider } from "../../contexts/DomainPackContext";
import { isLiveOpsPack, resolvePackBySlug } from "../../lib/domain-packs";
import type { AdminDomainPackCatalogEntry } from "../../api";
import type { PlatformReadiness } from "../../api";
import type { ReactNode } from "react";

const mockApi = vi.hoisted(() => ({
  fetchPlatformReadiness: vi.fn<() => Promise<PlatformReadiness>>(),
}));

vi.mock("../../api", () => mockApi);

const pack = (() => {
  const meta = resolvePackBySlug("greenhouse")!;
  if (!isLiveOpsPack(meta)) throw new Error("expected a live pack");
  return meta;
})();

const catalog: AdminDomainPackCatalogEntry[] = [
  {
    id: "agriculture",
    display_name: "农场工长",
    status: "live",
    active: true,
  },
];

function renderWithDomainPack(children: ReactNode) {
  return renderWithProviders({
    initialEntries: ["/scenes/greenhouse/ops/platform"],
    lang: "en",
    children: (
      <DomainPackProvider pack={pack} catalog={catalog} activeDomain="agriculture">
        {children}
      </DomainPackProvider>
    ),
  });
}

function makeReadiness(overrides: Partial<PlatformReadiness> = {}): PlatformReadiness {
  return {
    ready: true,
    generated_at: "2026-07-14T00:00:00Z",
    deployment_id: "dep-1",
    active_domain: "agriculture",
    checks: [],
    packs: [],
    runtime_issues: [],
    reports: [],
    pending_confirms_count: 0,
    ...overrides,
  };
}

describe("PlatformReadinessPanel", () => {
  beforeEach(() => {
    mockApi.fetchPlatformReadiness.mockReset();
  });

  it("renders ready state and all-good summary", async () => {
    mockApi.fetchPlatformReadiness.mockResolvedValue(
      makeReadiness({
        ready: true,
        checks: [
          { id: "llm", ok: true, label: "LLM", detail: "ok", severity: "warning" },
          { id: "mqtt", ok: true, label: "MQTT", detail: "ok", severity: "warning" },
        ],
      }),
    );

    renderWithDomainPack(<PlatformReadinessPanel />);

    await waitFor(() => {
      expect(screen.getByText(/Ready/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/No blockers/i)).toBeInTheDocument();
    expect(screen.getByText("dep-1 · agriculture")).toBeInTheDocument();
  });

  it("renders blocked state with action list for failing checks", async () => {
    mockApi.fetchPlatformReadiness.mockResolvedValue(
      makeReadiness({
        ready: false,
        checks: [
          {
            id: "mqtt",
            ok: false,
            label: "MQTT",
            detail: "broker unreachable",
            severity: "error",
          },
          {
            id: "node",
            ok: false,
            label: "Nodes",
            detail: "0 / 2 online",
            severity: "error",
          },
        ],
      }),
    );

    renderWithDomainPack(<PlatformReadinessPanel />);

    await waitFor(() => {
      expect(screen.getByText(/Needs attention/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Message bus down/i)).toBeInTheDocument();
    expect(screen.getByText(/Devices offline/i)).toBeInTheDocument();
    const devicesLink = screen.getByRole("link", { name: /Open devices/i });
    expect(devicesLink).toHaveAttribute("href", "/scenes/greenhouse/ops/devices");
  });

  it("shows fetch error message when readiness fails", async () => {
    mockApi.fetchPlatformReadiness.mockRejectedValue(new Error("network down"));

    renderWithDomainPack(<PlatformReadinessPanel />);

    await waitFor(() => {
      expect(screen.getByText(/network down/i)).toBeInTheDocument();
    });
  });

  it("refresh button triggers another fetch", async () => {
    const user = userEvent.setup();
    mockApi.fetchPlatformReadiness.mockResolvedValue(
      makeReadiness({
        ready: true,
        checks: [{ id: "llm", ok: true, label: "LLM", detail: "ok", severity: "warning" }],
      }),
    );

    renderWithDomainPack(<PlatformReadinessPanel />);

    await waitFor(() => {
      expect(screen.getByText(/Ready/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Refresh$/i }));

    await waitFor(() => {
      expect(mockApi.fetchPlatformReadiness).toHaveBeenCalledTimes(2);
    });
  });

  it("hides path-like details in diagnostics", async () => {
    const user = userEvent.setup();
    mockApi.fetchPlatformReadiness.mockResolvedValue(
      makeReadiness({
        ready: false,
        checks: [
          {
            id: "eval-reports",
            ok: false,
            label: "Eval reports",
            detail: "/Users/ht/agentstack/eval-reports/core.json",
            severity: "error",
          },
        ],
      }),
    );

    renderWithDomainPack(<PlatformReadinessPanel />);

    await waitFor(() => {
      expect(screen.getByText("Advanced diagnostics", { selector: "summary" })).toBeInTheDocument();
    });

    await user.click(screen.getByText("Advanced diagnostics", { selector: "summary" }));

    await waitFor(() => {
      expect(screen.getByTitle(/eval-reports/i)).toBeInTheDocument();
    });
    const grid = document.querySelector(".readiness-check-grid");
    expect(grid).toBeTruthy();
    expect(within(grid as HTMLElement).getByText(/\(local path hidden\)/i)).toBeInTheDocument();
  });

  it("shows fallback blocked message when summaries are filtered out", async () => {
    mockApi.fetchPlatformReadiness.mockResolvedValue(
      makeReadiness({
        ready: false,
        checks: [
          {
            id: "sim_matrix",
            ok: false,
            label: "Sim matrix",
            detail: "/Users/ht/agentstack/sim_matrix.json",
            severity: "error",
          },
        ],
        runtime_issues: [
          {
            code: "eval-reports",
            message: "/Users/ht/agentstack/eval-reports/core.json",
            severity: "error",
          },
        ],
      }),
    );

    renderWithDomainPack(<PlatformReadinessPanel />);

    await waitFor(() => {
      expect(screen.getByText(/Expand Advanced diagnostics below/i)).toBeInTheDocument();
    });
    const banner = document.querySelector(".console-banner.warn");
    expect(banner).toHaveTextContent(/Needs attention/i);
  });
});
