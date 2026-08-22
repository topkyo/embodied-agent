import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import SceneOpsReview from "./SceneOpsReview";
import { DomainPackProvider } from "../../contexts/DomainPackContext";
import { mockAppFetch, renderWithProviders, setOpsRoleFromAuth } from "../../test-utils";
import type { LiveDomainPackMeta } from "../../lib/domain-packs";

vi.mock("../../features/ops/PolicySuggestionsPanel", () => ({
  PolicySuggestionsPanel: () => <div data-testid="policy-panel" />,
}));
vi.mock("../../features/ops/SceneOutcomesPanel", () => ({
  SceneOutcomesPanel: () => <div data-testid="outcomes-panel" />,
}));
vi.mock("./pack-ops-registry", () => ({
  resolvePackOpsPanelsFromSchema: () => ({ ReviewPanel: null }),
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

describe("SceneOpsReview", () => {
  it("denies non-admin with Admin access required heading", () => {
    mockAppFetch({ authMe: { user_id: "u1", role: "user", display_name: "U" } });
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });
    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/review"],
      lang: "en",
      children: (
        <DomainPackProvider pack={greenhousePack}>
          <SceneOpsReview />
        </DomainPackProvider>
      ),
    });
    expect(screen.getByRole("heading", { name: /Admin access required/i })).toBeInTheDocument();
    expect(screen.queryByTestId("outcomes-panel")).not.toBeInTheDocument();
  });

  it("shows review title for admin", () => {
    mockAppFetch({ authMe: { user_id: "a1", role: "admin", display_name: "A" } });
    setOpsRoleFromAuth({ user_id: "a1", role: "admin", display_name: "A" });
    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/review"],
      lang: "en",
      children: (
        <DomainPackProvider pack={greenhousePack}>
          <SceneOpsReview />
        </DomainPackProvider>
      ),
    });
    expect(screen.getByRole("heading", { name: /Scene review/i })).toBeInTheDocument();
    expect(screen.getByTestId("outcomes-panel")).toBeInTheDocument();
  });
});
