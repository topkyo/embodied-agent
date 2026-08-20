import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SceneOpsDisabled from "./SceneOpsDisabled";
import { renderWithProviders } from "../../test-utils";
import type { LiveDomainPackMeta, PlaceholderDomainPackMeta } from "../../lib/domain-packs";

const livePack: LiveDomainPackMeta = {
  slug: "greenhouse",
  displayNameKey: "scenes.farm.tag",
  status: "live",
  runtimeStatus: "live",
  scenePath: "/scenes/greenhouse",
  packId: "agriculture",
  opsPath: "/scenes/greenhouse/ops",
  opsEnabled: true,
};

const placeholderPack: PlaceholderDomainPackMeta = {
  slug: "aquaculture",
  displayNameKey: "scenes.aquaculture.title",
  status: "next",
  runtimeStatus: "placeholder",
  scenePath: "/scenes/aquaculture",
  packId: "aquaculture",
  opsEnabled: false,
};

describe("SceneOpsDisabled", () => {
  it("renders disabled title and back link for inactive_domain", () => {
    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <SceneOpsDisabled pack={livePack} reason="inactive_domain" detail="robotics" />,
    });
    expect(
      screen.getByRole("heading", { name: /Scene ops not available yet/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to domain picker/i })).toBeInTheDocument();
  });

  it("renders catalog_error detail path", () => {
    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <SceneOpsDisabled pack={livePack} reason="catalog_error" detail="boom" />,
    });
    expect(
      screen.getByRole("heading", { name: /Scene ops not available yet/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/boom/i)).toBeInTheDocument();
  });

  it("admin_required: 走 Navigate 到 /login，不再渲染 AccessGate column", () => {
    render(
      <MemoryRouter initialEntries={["/scenes/greenhouse/ops/platform"]}>
        <Routes>
          <Route
            path="/scenes/greenhouse/ops/platform"
            element={<SceneOpsDisabled pack={livePack} reason="admin_required" />}
          />
          <Route path="/login" element={<div data-testid="login-reached">login</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("heading", { name: /Scene ops not available yet/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Sign in$/i })).toBeNull();
  });

  it("placeholder pack still shows disabled shell title", () => {
    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <SceneOpsDisabled pack={placeholderPack} reason="disabled" />,
    });
    expect(
      screen.getByRole("heading", { name: /Scene ops not available yet/i }),
    ).toBeInTheDocument();
  });
});
