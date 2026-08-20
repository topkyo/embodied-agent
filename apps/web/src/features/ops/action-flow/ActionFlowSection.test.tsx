import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { CommandRow } from "../../../api/commands";
import { jsonResponse, mockAppFetch, renderWithProviders } from "../../../test-utils";
import { ActionFlowSection } from "./ActionFlowSection";

afterEach(() => {
  vi.restoreAllMocks();
});

const commands: CommandRow[] = [
  {
    command_id: "cmd-1",
    status: "running",
    updated_at: "2026-07-01T00:00:00.000Z",
    command: { device_id: "gh-001", action: "vent", issued_by: { user_id: "u1" } },
    result: { actual_duration_seconds: 5 },
  },
];

function mockCommandsApi(rows: CommandRow[] = commands) {
  return mockAppFetch({
    authMe: { user_id: "u1", role: "user", display_name: "U" },
    routes: [
      (url, init) => {
        if (!url.includes("/admin/commands") || (init?.method ?? "GET").toUpperCase() !== "GET") {
          return null;
        }
        return jsonResponse({ commands: rows, count: rows.length });
      },
    ],
  });
}

describe("ActionFlowSection", () => {
  it("renders four progress stage nodes when a command is present", async () => {
    mockCommandsApi();

    const { container } = renderWithProviders({
      lang: "en",
      children: <ActionFlowSection pending={[]} />,
    });

    await waitFor(() => {
      expect(screen.getByTestId("action-flow-progress")).toBeInTheDocument();
    });

    const nodes = screen.getByTestId("action-flow-progress").querySelectorAll("[data-stage]");
    expect(nodes).toHaveLength(4);
    expect(screen.getByTestId("action-flow")).toHaveClass("action-flow--enter");
    expect(container.querySelector(".action-flow-stage--current[data-stage='execute']")).toBeTruthy();
  });

  it("focuses confirm stage when pending exists", async () => {
    mockCommandsApi();

    renderWithProviders({
      lang: "en",
      children: (
        <ActionFlowSection
          pending={[
            {
              user_id: "u1",
              created_at: Date.now(),
              expires_at: Date.now() + 60_000,
              action_summary: "vent",
              target_summary: "gh-001",
            },
          ]}
        />
      ),
    });

    await waitFor(() => {
      expect(screen.getByTestId("action-flow-progress")).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("action-flow-progress").querySelector("[data-stage='confirm']"),
    ).toHaveClass("action-flow-stage--current");
  });

  it("notifies parent when focus command is executing", async () => {
    mockCommandsApi();
    const onFocusExecutingChange = vi.fn();

    renderWithProviders({
      lang: "en",
      children: <ActionFlowSection pending={[]} onFocusExecutingChange={onFocusExecutingChange} />,
    });

    await waitFor(() => {
      expect(onFocusExecutingChange).toHaveBeenCalledWith(true);
    });
  });

  it("includes reduced-motion fallback in action-flow styles", () => {
    const cssPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../design/action-flow.css",
    );
    const css = readFileSync(cssPath, "utf8");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});
