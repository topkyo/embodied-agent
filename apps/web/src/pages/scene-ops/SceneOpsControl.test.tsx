import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import SceneOpsControl from "./SceneOpsControl";
import { DomainPackProvider } from "../../contexts/DomainPackContext";
import { mockAppFetch, renderWithProviders, setOpsRoleFromAuth } from "../../test-utils";
import type { LiveDomainPackMeta } from "../../lib/domain-packs";
import type { SceneOpsReadinessState } from "../../contexts/SceneOpsReadinessContext";
import type { PackOpsPanels } from "./pack-ops-registry";

vi.mock("../../features/ops/DomainPackOpsSchemaPanel", () => ({
  DomainPackControlActionsPanel: () => (
    <div data-testid="control-actions">control-actions</div>
  ),
}));

const state = vi.hoisted(() => ({
  panels: {} as Partial<PackOpsPanels>,
  readiness: {} as Partial<SceneOpsReadinessState>,
}));

vi.mock("./pack-ops-registry", () => ({
  resolvePackOpsPanelsFromSchema: () => state.panels,
}));

const readyState: SceneOpsReadinessState = {
  loading: false,
  error: null,
  data: null,
  blockingIssue: null,
  ready: true,
  blocked: false,
  refresh: () => {},
};

vi.mock("../../contexts/SceneOpsReadinessContext", () => ({
  useSceneOpsReadiness: () => ({ ...readyState, ...state.readiness }),
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

function renderControl() {
  return renderWithProviders({
    initialEntries: ["/scenes/greenhouse/ops/control"],
    lang: "en",
    children: (
      <DomainPackProvider pack={greenhousePack}>
        <SceneOpsControl />
      </DomainPackProvider>
    ),
  });
}

describe("SceneOpsControl", () => {
  it("renders no-control-console header when ControlPanel is absent", () => {
    state.panels = {
      ControlPanel: undefined,
      controlRequiresInstaller: false,
    };
    state.readiness = { ready: true, blocked: false };
    mockAppFetch({
      authMe: { user_id: "a1", role: "admin", display_name: "A" },
    });
    setOpsRoleFromAuth({ user_id: "a1", role: "admin", display_name: "A" });
    renderControl();

    expect(
      screen.getByRole("heading", {
        name: /This scene has no manual control console/i,
      }),
    ).toBeInTheDocument();
  });

  it("shows readiness checking text when loading and not ready", () => {
    state.panels = {
      ControlPanel: undefined,
      controlRequiresInstaller: false,
    };
    state.readiness = { loading: true, ready: false, blocked: false };
    mockAppFetch({
      authMe: { user_id: "a1", role: "admin", display_name: "A" },
    });
    setOpsRoleFromAuth({ user_id: "a1", role: "admin", display_name: "A" });
    renderControl();

    expect(screen.getByText(/Checking deployment health/i)).toBeInTheDocument();
  });

  it("shows readiness blocked banner when blocked with a blocking issue", () => {
    state.panels = {
      ControlPanel: undefined,
      controlRequiresInstaller: false,
    };
    state.readiness = {
      loading: false,
      ready: false,
      blocked: true,
      blockingIssue: {
        code: "mqtt",
        label: "MQTT Transport",
        detail: "Broker unreachable",
        severity: "error" as const,
      },
    };
    mockAppFetch({
      authMe: { user_id: "a1", role: "admin", display_name: "A" },
    });
    setOpsRoleFromAuth({ user_id: "a1", role: "admin", display_name: "A" });
    renderControl();

    expect(screen.getByText(/Readiness blocked/i)).toBeInTheDocument();
    expect(screen.getByText(/Message bus down/i)).toBeInTheDocument();
  });

  it("renders ControlPanel when schema provides one and ready", () => {
    state.panels = {
      ControlPanel: () => <div data-testid="custom-control">custom</div>,
      controlRequiresInstaller: false,
      controlTitle: "Robot Control",
      controlLead: "Manual control",
    };
    state.readiness = { ready: true, blocked: false };
    mockAppFetch({
      authMe: { user_id: "a1", role: "admin", display_name: "A" },
    });
    setOpsRoleFromAuth({ user_id: "a1", role: "admin", display_name: "A" });
    renderControl();

    expect(screen.getByRole("heading", { name: /Robot Control/i })).toBeInTheDocument();
    expect(screen.getByTestId("custom-control")).toBeInTheDocument();
  });

  it("denies non-admin when controlRequiresInstaller is true", () => {
    state.panels = {
      ControlPanel: () => <div data-testid="custom-control">custom</div>,
      controlRequiresInstaller: true,
      controlTitle: "Robot Control",
      controlLead: "Manual control",
    };
    state.readiness = { ready: true, blocked: false };
    mockAppFetch({
      authMe: { user_id: "u1", role: "user", display_name: "U" },
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });
    renderControl();

    expect(
      screen.getByRole("heading", { name: /Admin access required/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("custom-control")).not.toBeInTheDocument();
  });
});
