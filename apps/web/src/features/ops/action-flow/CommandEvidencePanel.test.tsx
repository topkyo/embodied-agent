import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { CommandRow } from "../../../api/commands";
import { jsonResponse, mockAppFetch, renderWithProviders } from "../../../test-utils";
import { CommandEvidencePanel } from "./CommandEvidencePanel";

afterEach(() => {
  vi.restoreAllMocks();
});

const commands: CommandRow[] = [
  {
    command_id: "cmd-1",
    status: "completed",
    updated_at: "2026-07-01T00:00:00.000Z",
    command: { device_id: "gh-001", action: "vent", issued_by: { user_id: "u1" } },
    result: { actual_duration_seconds: 12 },
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

describe("CommandEvidencePanel", () => {
  it("shows empty state when there are no commands", async () => {
    mockCommandsApi([]);

    renderWithProviders({
      lang: "en",
      children: <CommandEvidencePanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("No command records yet")).toBeInTheDocument();
    });
  });

  it("renders command rows with action, device, and duration", async () => {
    mockCommandsApi();

    renderWithProviders({
      lang: "en",
      children: <CommandEvidencePanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("vent")).toBeInTheDocument();
    });
    expect(screen.getByText(/gh-001/)).toBeInTheDocument();
    expect(screen.getByText(/12s/)).toBeInTheDocument();
    expect(screen.getByText("Ack")).toBeInTheDocument();
    expect(screen.getAllByTestId("command-evidence-row")).toHaveLength(1);
  });
});
