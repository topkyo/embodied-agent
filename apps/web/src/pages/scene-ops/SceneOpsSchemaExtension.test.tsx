import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import SceneOpsSchemaExtension from "./SceneOpsSchemaExtension";
import { DomainPackProvider } from "../../contexts/DomainPackContext";
import { renderWithProviders } from "../../test-utils";
import type { LiveDomainPackMeta } from "../../lib/domain-packs";
import type { DomainPackOpsSchema } from "../../api";

vi.mock("../../components/LangSwitcher", () => ({
  default: () => <span data-testid="lang-switcher" />,
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

function baseSchema(tabs: DomainPackOpsSchema["navigation"]["tabs"]): DomainPackOpsSchema {
  return {
    schema_version: 1,
    pack_id: "agriculture",
    display_name: "Farm Steward",
    status: "live",
    navigation: { tabs },
    settings: { fields: [] },
    devices: {
      binding: {
        required_transports: [],
        physical_skills: [],
        required_nodes: [],
      },
    },
    control: { actions: [] },
    eval_evidence: { slices: [] },
  };
}

function renderExtension(path: string, schema: DomainPackOpsSchema | null, adminLoading = false) {
  return renderWithProviders({
    initialEntries: [path],
    lang: "en",
    children: (
      <DomainPackProvider
        pack={greenhousePack}
        activeOpsSchema={schema}
        adminLoading={adminLoading}
      >
        <Routes>
          <Route path="/scenes/:packSlug/ops/*" element={<SceneOpsSchemaExtension />} />
        </Routes>
      </DomainPackProvider>
    ),
  });
}

describe("SceneOpsSchemaExtension route fallback (Phase 2.5)", () => {
  it("renders NotFound for unknown ops path without extension tab", async () => {
    renderExtension(
      "/scenes/greenhouse/ops/does-not-exist",
      baseSchema([
        { id: "overview", label: "Overview", route: "", kind: "overview", enabled: true },
      ]),
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Page not found/i })).toBeInTheDocument();
    });
  });

  it("renders extension shell when kind=extension tab matches", async () => {
    renderExtension(
      "/scenes/greenhouse/ops/custom-ext",
      baseSchema([
        {
          id: "custom-ext",
          label: "Custom extension",
          route: "custom-ext",
          kind: "extension",
          enabled: true,
        },
      ]),
    );

    await waitFor(() => {
      expect(screen.getByText(/Custom extension/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: /Page not found/i })).not.toBeInTheDocument();
  });

  it("shows loading while admin schema is fetching", async () => {
    renderExtension("/scenes/greenhouse/ops/anything", null, true);

    await waitFor(() => {
      expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    });
  });
});
