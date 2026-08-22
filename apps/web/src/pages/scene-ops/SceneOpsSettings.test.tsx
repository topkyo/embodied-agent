import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import SceneOpsSettings from "./SceneOpsSettings";
import { DomainPackProvider } from "../../contexts/DomainPackContext";
import { mockAppFetch, renderWithProviders, setOpsRoleFromAuth } from "../../test-utils";
import type { LiveDomainPackMeta } from "../../lib/domain-packs";

vi.mock("../../features/settings/SceneSettingsForm", () => ({
  SceneSettingsForm: () => <div data-testid="scene-settings-form">settings-form</div>,
}));

vi.mock("../../features/ops/DomainPackOpsSchemaPanel", () => ({
  DomainPackSettingsSchemaPanel: () => (
    <div data-testid="schema-panel">schema</div>
  ),
}));

vi.mock("./pack-ops-registry", () => ({
  resolvePackOpsPanelsFromSchema: () => ({
    SettingsPanel: undefined,
    settingsTitle: undefined,
    settingsLead: undefined,
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

function renderSettings() {
  return renderWithProviders({
    initialEntries: ["/scenes/greenhouse/ops/settings"],
    lang: "en",
    children: (
      <DomainPackProvider pack={greenhousePack}>
        <SceneOpsSettings />
      </DomainPackProvider>
    ),
  });
}

describe("SceneOpsSettings", () => {
  it("denies non-admin user with Admin access required heading", () => {
    mockAppFetch({
      authMe: { user_id: "u1", role: "user", display_name: "U" },
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });
    renderSettings();

    expect(
      screen.getByRole("heading", { name: /Admin access required/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("scene-settings-form")).not.toBeInTheDocument();
  });

  it("renders SceneSettingsForm for admin", () => {
    mockAppFetch({
      authMe: { user_id: "a1", role: "admin", display_name: "A" },
    });
    setOpsRoleFromAuth({ user_id: "a1", role: "admin", display_name: "A" });
    renderSettings();

    expect(screen.getByTestId("scene-settings-form")).toBeInTheDocument();
  });

  it("renders advanced schema details section for admin", () => {
    mockAppFetch({
      authMe: { user_id: "a1", role: "admin", display_name: "A" },
    });
    setOpsRoleFromAuth({ user_id: "a1", role: "admin", display_name: "A" });
    renderSettings();

    expect(screen.getByText(/Advanced: settings field schema/i)).toBeInTheDocument();
    expect(screen.getByTestId("schema-panel")).toBeInTheDocument();
  });

  it("renders advanced schema lead text for admin (default branch)", () => {
    mockAppFetch({
      authMe: { user_id: "a1", role: "admin", display_name: "A" },
    });
    setOpsRoleFromAuth({ user_id: "a1", role: "admin", display_name: "A" });
    renderSettings();

    expect(screen.getByText(/Contract.debug field table/i)).toBeInTheDocument();
  });

  it("does not render settings form for non-admin (denied shell)", () => {
    mockAppFetch({
      authMe: { user_id: "u1", role: "user", display_name: "U" },
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });
    renderSettings();

    expect(screen.queryByTestId("scene-settings-form")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schema-panel")).not.toBeInTheDocument();
  });
});
