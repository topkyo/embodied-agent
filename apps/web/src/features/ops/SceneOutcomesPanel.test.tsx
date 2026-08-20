import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { SceneOutcomesPanel } from "./SceneOutcomesPanel";
import { renderWithProviders } from "../../test-utils";

const fetchSceneOutcomes = vi.fn();

vi.mock("../../api", () => ({
  fetchSceneOutcomes: (...args: unknown[]) => fetchSceneOutcomes(...args),
}));

describe("SceneOutcomesPanel", () => {
  beforeEach(() => {
    fetchSceneOutcomes.mockReset();
    fetchSceneOutcomes.mockResolvedValue({
      deployment_id: "dep-1",
      outcomes: [
        {
          ts: "2026-03-15T08:30:00.000Z",
          deployment_id: "dep-1",
          scene_skill_id: "post_irrigation_ventilation",
          entity_id: "gh-001",
          success: true,
          metrics: { temperature_delta_c: -1.2 },
        },
      ],
    });
  });

  it("shows localized datetime and human skill name (zh)", async () => {
    renderWithProviders({
      initialEntries: ["/"],
      lang: "zh",
      children: <SceneOutcomesPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText(/灌后通风/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/post_irrigation_ventilation/)).not.toBeInTheDocument();
    const row = screen.getByRole("listitem");
    // ISO "T" fragment must not appear; skill and status are humanized
    expect(row.textContent).not.toMatch(/2026-03-15T08/);
    expect(row.textContent).toMatch(/灌后通风/);
    expect(row.textContent).toMatch(/达标/);
    expect(row.textContent).toMatch(/ΔT -1\.2°C/);
  });

  it("falls back to title-case skill when no i18n key", async () => {
    fetchSceneOutcomes.mockResolvedValue({
      deployment_id: "dep-1",
      outcomes: [
        {
          ts: "2026-03-15T08:30:00.000Z",
          deployment_id: "dep-1",
          scene_skill_id: "unknown_custom_skill",
          success: false,
          metrics: {},
        },
      ],
    });
    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <SceneOutcomesPanel />,
    });
    await waitFor(() => {
      expect(screen.getByText(/Unknown Custom Skill/)).toBeInTheDocument();
    });
  });
});
