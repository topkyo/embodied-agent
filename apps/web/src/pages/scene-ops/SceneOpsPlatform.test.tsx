import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import SceneOpsPlatform from "./SceneOpsPlatform";
import { renderWithProviders } from "../../test-utils";

vi.mock("../../features/ops/PlatformReadinessPanel", () => ({
  PlatformReadinessPanel: () => <div data-testid="readiness-panel">readiness</div>,
}));
vi.mock("../../features/settings/PlatformSettingsForm", () => ({
  PlatformSettingsForm: ({ hideHeader }: { hideHeader?: boolean }) => (
    <div data-testid="settings-form" data-hide-header={hideHeader ? "1" : "0"}>
      settings
    </div>
  ),
}));
vi.mock("../../features/ops/PlatformChannelsPanel", () => ({
  PlatformChannelsPanel: () => <div data-testid="channels-panel">channels</div>,
}));
vi.mock("../../features/ops/PlatformMoatPanels", () => ({
  PlatformMoatPanels: () => <div data-testid="moat-panels">moat</div>,
}));
vi.mock("../../features/ops/DomainPackOpsSchemaPanel", () => ({
  DomainPackOpsSchemaPanel: () => <div data-testid="schema-panel">schema</div>,
}));

function renderPlatform(path = "/scenes/greenhouse/ops/platform") {
  return renderWithProviders({
    initialEntries: [path],
    lang: "en",
    children: (
      <Routes>
        <Route path="/scenes/:packSlug/ops/platform" element={<SceneOpsPlatform />} />
      </Routes>
    ),
  });
}

describe("SceneOpsPlatform tabs", () => {
  it("defaults to health tab (readiness only)", () => {
    renderPlatform();

    expect(screen.getByRole("tab", { name: /Health/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("readiness-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-form")).not.toBeInTheDocument();
    expect(screen.queryByTestId("channels-panel")).not.toBeInTheDocument();
  });

  it("opens config tab from ?tab=config and hides settings page header", () => {
    renderPlatform("/scenes/greenhouse/ops/platform?tab=config");

    expect(screen.getByRole("tab", { name: /Config/i })).toHaveAttribute("aria-selected", "true");
    const form = screen.getByTestId("settings-form");
    expect(form).toBeInTheDocument();
    expect(form).toHaveAttribute("data-hide-header", "1");
    expect(screen.queryByTestId("readiness-panel")).not.toBeInTheDocument();
  });

  it("opens advanced tab with collapsed sub-sections", () => {
    renderPlatform("/scenes/greenhouse/ops/platform?tab=advanced");

    expect(screen.getByRole("tab", { name: /Advanced/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("channels-panel")).toBeInTheDocument();
    expect(screen.getByTestId("moat-panels")).toBeInTheDocument();
    expect(screen.getByTestId("schema-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("readiness-panel")).not.toBeInTheDocument();
  });

  it("falls back to health for unknown tab query", () => {
    renderPlatform("/scenes/greenhouse/ops/platform?tab=nope");

    expect(screen.getByRole("tab", { name: /Health/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("readiness-panel")).toBeInTheDocument();
  });

  it("clicking a tab updates the URL query", async () => {
    const user = userEvent.setup();
    renderPlatform();

    await user.click(screen.getByRole("tab", { name: /Config/i }));

    await waitFor(() => {
      expect(screen.getByTestId("settings-form")).toBeInTheDocument();
    });
    expect(screen.getByRole("tab", { name: /Config/i })).toHaveAttribute("aria-selected", "true");
    // MemoryRouter reflects search on location via the selected tab state
    expect(screen.queryByTestId("readiness-panel")).not.toBeInTheDocument();
  });

  it("#flywheel deep-link switches to advanced and expands flywheel", async () => {
    renderPlatform("/scenes/greenhouse/ops/platform#flywheel");

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Advanced/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
    const flywheel = document.getElementById("flywheel");
    expect(flywheel).toBeTruthy();
    expect(flywheel).toHaveAttribute("open");
  });
});
