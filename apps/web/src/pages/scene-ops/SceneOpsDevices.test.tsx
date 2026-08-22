import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import SceneOpsDevices from "./SceneOpsDevices";
import { DomainPackProvider } from "../../contexts/DomainPackContext";
import { mockAppFetch, renderWithProviders, setOpsRoleFromAuth } from "../../test-utils";
import type { LiveDomainPackMeta } from "../../lib/domain-packs";

vi.mock("../../features/ops/NodeManagementPanel", () => ({
  NodeManagementPanel: () => <div data-testid="node-mgmt">node-management</div>,
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

function renderDevices() {
  return renderWithProviders({
    initialEntries: ["/scenes/greenhouse/ops/devices"],
    lang: "en",
    children: (
      <DomainPackProvider pack={greenhousePack}>
        <SceneOpsDevices />
      </DomainPackProvider>
    ),
  });
}

describe("SceneOpsDevices", () => {
  it("renders the device page header with product title", () => {
    mockAppFetch({
      authMe: { user_id: "u1", role: "user", display_name: "U" },
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });
    renderDevices();

    expect(screen.getByRole("heading", { name: /Device install & bind/i })).toBeInTheDocument();
  });

  it("renders the product lead subtitle", () => {
    mockAppFetch({
      authMe: { user_id: "u1", role: "user", display_name: "U" },
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });
    renderDevices();

    expect(
      screen.getByText(/Issue install codes, bind nodes, and publish config/i),
    ).toBeInTheDocument();
  });

  it("renders NodeManagementPanel as default devices panel", () => {
    mockAppFetch({
      authMe: { user_id: "u1", role: "user", display_name: "U" },
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });
    renderDevices();

    expect(screen.getByTestId("node-mgmt")).toBeInTheDocument();
  });

  it("wraps content in a settings-console section", () => {
    mockAppFetch({
      authMe: { user_id: "u1", role: "user", display_name: "U" },
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });
    renderDevices();

    const section = document.querySelector("section.settings.settings-console");
    expect(section).toBeTruthy();
  });
});
