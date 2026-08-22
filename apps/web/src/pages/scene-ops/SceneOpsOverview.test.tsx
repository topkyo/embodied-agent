import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import SceneOpsOverview from "./SceneOpsOverview";
import { DomainPackProvider } from "../../contexts/DomainPackContext";
import {
  mockAppFetch,
  renderWithProviders,
  setOpsRoleFromAuth,
  jsonResponse,
} from "../../test-utils";
import type { AdminOverview } from "../../api";
import type { LiveDomainPackMeta } from "../../lib/domain-packs";

vi.mock("../../features/ops/ReadonlyOpsPanel", () => ({
  ReadonlyOpsPanel: () => <div data-testid="readonly-ops">readonly</div>,
}));

vi.mock("./pack-ops-registry", () => ({
  resolvePackOpsPanelsFromSchema: () => ({
    overviewIcon: () => <span data-testid="overview-icon" aria-hidden />,
    showGenericMetrics: true,
    showGenericNodes: true,
    showReadonlyOps: true,
    OverviewPanel: () => <div>pack panel</div>,
  }),
}));

const greenhousePack: LiveDomainPackMeta = {
  slug: "greenhouse",
  displayNameKey: "scenes.farm.tag",
  status: "live",
  runtimeStatus: "live",
  scenePath: "/scenes/greenhouse",
  packId: "agriculture",
  opsPath: "/scenes/greenhouse/ops",
  opsEnabled: true,
};

function makeOverview(): AdminOverview {
  return {
    deployment_id: "dep-1",
    deployment_name: "Greenhouse Alpha",
    entities: [],
    nodes: [
      {
        node_id: "node-1",
        entity_id: "gh-001",
        status: "active",
        online: true,
        reported_at: "2026-01-01T00:00:00Z",
      },
    ],
    services: {
      api: "ok",
      deployment_id: "dep-1",
      deployment_name: "Greenhouse Alpha",
      llm_configured: true,
      llm_provider: "deepseek",
      llm_model: "deepseek-v4-flash",
      stt_provider: "none",
      stt_model: "",
      stt_enabled: false,
      mqtt_url: "mqtt://localhost:1883",
      chat_channel: "test",
    },
    pending_confirms_count: 2,
    pending_confirms: [],
    active_alert_rules_count: 3,
  };
}

function mockOverviewFetch(overview = makeOverview()) {
  mockAppFetch({
    authMe: { user_id: "u1", role: "user", display_name: "U" },
    routes: [
      (url) => (url.includes("/admin/overview") ? jsonResponse(overview) : null),
      (url, init) => {
        if (!url.includes("/admin/commands") || (init?.method ?? "GET").toUpperCase() !== "GET") {
          return null;
        }
        return jsonResponse({ commands: [], count: 0 });
      },
    ],
  });
}

function renderOverview() {
  return renderWithProviders({
    initialEntries: ["/scenes/greenhouse/ops"],
    lang: "en",
    children: (
      <DomainPackProvider pack={greenhousePack}>
        <SceneOpsOverview />
      </DomainPackProvider>
    ),
  });
}

describe("SceneOpsOverview", () => {
  it("renders the overview page header with title", async () => {
    mockOverviewFetch();
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });
    renderOverview();

    expect(
      screen.getByRole("heading", { name: /Scene operations overview/i }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Pending confirms/i)).toBeInTheDocument();
    });
  });

  it("renders generic metrics (pending confirms + active thresholds) after fetch", async () => {
    mockOverviewFetch();
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });
    renderOverview();

    await waitFor(() => {
      expect(screen.getByText(/Pending confirms: 2/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Active thresholds: 3/i)).toBeInTheDocument();
  });

  it("renders nodes list with node id and online status", async () => {
    mockOverviewFetch();
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });
    renderOverview();

    await waitFor(() => {
      expect(screen.getByText(/node-1/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/online/i)).toBeInTheDocument();
  });

  it("renders ReadonlyOpsPanel when showReadonlyOps is true", async () => {
    mockOverviewFetch();
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });
    renderOverview();

    await waitFor(() => {
      expect(screen.getByTestId("readonly-ops")).toBeInTheDocument();
    });
  });

  it("renders action-flow before pack overview and shows pending rows", async () => {
    mockOverviewFetch({
      ...makeOverview(),
      pending_confirms: [
        {
          user_id: "u1",
          created_at: 1_700_000_000_000,
          expires_at: 1_700_000_600_000,
          action_summary: "Irrigate zone A",
          target_summary: "gh-001",
        },
      ],
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });
    renderOverview();

    await waitFor(() => {
      expect(screen.getByTestId("action-flow")).toBeInTheDocument();
    });
    expect(screen.getByTestId("pack-overview")).toBeInTheDocument();
    expect(screen.getByText("Irrigate zone A")).toBeInTheDocument();

    const actionFlow = screen.getByTestId("action-flow");
    const packOverview = screen.getByTestId("pack-overview");
    expect(
      actionFlow.compareDocumentPosition(packOverview) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("does not render web confirm or reject buttons on overview", async () => {
    mockOverviewFetch({
      ...makeOverview(),
      pending_confirms: [
        {
          user_id: "u1",
          created_at: 1_700_000_000_000,
          expires_at: 1_700_000_600_000,
          action_summary: "Close vents",
          target_summary: "gh-002",
        },
      ],
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });
    renderOverview();

    await waitFor(() => {
      expect(screen.getByText("Close vents")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /确认|reject|confirm/i }),
    ).not.toBeInTheDocument();
  });

  it("shows error banner with retry button when fetch fails", async () => {
    mockAppFetch({
      authMe: { user_id: "u1", role: "user", display_name: "U" },
      routes: [
        (url) => (url.includes("/admin/overview") ? jsonResponse({ error: "down" }, 500) : null),
      ],
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });
    renderOverview();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
    });
  });
});
