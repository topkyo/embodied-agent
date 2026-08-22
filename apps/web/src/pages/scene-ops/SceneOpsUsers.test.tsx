import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import SceneOpsUsers from "./SceneOpsUsers";
import { DomainPackProvider } from "../../contexts/DomainPackContext";
import { mockAppFetch, renderWithProviders, setOpsRoleFromAuth } from "../../test-utils";
import type { LiveDomainPackMeta } from "../../lib/domain-packs";

vi.mock("../../features/ops/UserManagementPanel", () => ({
  UserManagementPanel: () => <div data-testid="user-mgmt">user-management</div>,
}));

vi.mock("../../features/ops/WebAccountPanel", () => ({
  WebAccountPanel: () => <div data-testid="web-account">web-account</div>,
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

function renderUsers() {
  return renderWithProviders({
    initialEntries: ["/scenes/greenhouse/ops/users"],
    lang: "en",
    children: (
      <DomainPackProvider pack={greenhousePack}>
        <SceneOpsUsers />
      </DomainPackProvider>
    ),
  });
}

describe("SceneOpsUsers", () => {
  it("denies non-admin user with Admin access required heading", () => {
    mockAppFetch({
      authMe: { user_id: "u1", role: "user", display_name: "U" },
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });
    renderUsers();

    expect(
      screen.getByRole("heading", { name: /Admin access required/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("web-account")).not.toBeInTheDocument();
  });

  it("does not render web account or user management panels for non-admin", () => {
    mockAppFetch({
      authMe: { user_id: "u1", role: "user", display_name: "U" },
    });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });
    renderUsers();

    expect(screen.queryByTestId("web-account")).not.toBeInTheDocument();
    expect(screen.queryByTestId("user-mgmt")).not.toBeInTheDocument();
  });

  it("renders Workbench users title for admin", () => {
    mockAppFetch({
      authMe: { user_id: "a1", role: "admin", display_name: "A" },
    });
    setOpsRoleFromAuth({ user_id: "a1", role: "admin", display_name: "A" });
    renderUsers();

    expect(screen.getByRole("heading", { name: /Workbench users/i })).toBeInTheDocument();
  });

  it("renders WebAccountPanel for admin", () => {
    mockAppFetch({
      authMe: { user_id: "a1", role: "admin", display_name: "A" },
    });
    setOpsRoleFromAuth({ user_id: "a1", role: "admin", display_name: "A" });
    renderUsers();

    expect(screen.getByTestId("web-account")).toBeInTheDocument();
  });

  it("renders field operators advanced section with UserManagementPanel for admin", () => {
    mockAppFetch({
      authMe: { user_id: "a1", role: "admin", display_name: "A" },
    });
    setOpsRoleFromAuth({ user_id: "a1", role: "admin", display_name: "A" });
    renderUsers();

    expect(screen.getByText(/^Field operators$/)).toBeInTheDocument();
    expect(screen.getByTestId("user-mgmt")).toBeInTheDocument();
  });
});
