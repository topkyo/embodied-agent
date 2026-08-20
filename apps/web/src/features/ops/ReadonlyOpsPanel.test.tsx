import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReadonlyOpsPanel } from "./ReadonlyOpsPanel";
import { jsonResponse, mockAppFetch, renderWithProviders } from "../../test-utils";
import type { AlertRuleRow, CommandRow, ReportScheduleRow } from "../../api";

afterEach(() => {
  vi.restoreAllMocks();
});

const alertRules: AlertRuleRow[] = [
  { entity_id: "gh-001", metric: "temperature", operator: ">", value: 32, enabled: true },
];

const reportSchedules: ReportScheduleRow[] = [
  { id: "sch-1", deployment_id: "dep-1", user_id: "u-1", entity_ids: ["gh-001"], interval_minutes: 60, enabled: true },
];

const commands: CommandRow[] = [
  {
    command_id: "cmd-ok",
    status: "success",
    updated_at: "2026-07-01T00:00:00.000Z",
    command: { device_id: "gh-001", action: "vent", issued_by: { user_id: "u-1" } },
  },
  {
    command_id: "cmd-fail",
    status: "failed",
    updated_at: "2026-07-01T01:00:00.000Z",
    command: { device_id: "gh-001", action: "irrigate", issued_by: { user_id: "u-1" } },
  },
];

function mockOpsApi(opts: {
  rules?: AlertRuleRow[];
  schedules?: ReportScheduleRow[];
  commands?: CommandRow[];
  commandsStatus?: number;
  authMe?: { user_id: string; role: "admin" | "user"; display_name: string };
}) {
  return mockAppFetch({
    authMe: opts.authMe ?? { user_id: "u-test", role: "admin", display_name: "Admin" },
    routes: [
      (url, init) => {
        if (!url.includes("/admin/alert-rules") || (init?.method ?? "GET").toUpperCase() !== "GET") {
          return null;
        }
        return jsonResponse({ deployment_id: "dep-1", rules: opts.rules ?? [], count: (opts.rules ?? []).length });
      },
      (url, init) => {
        if (!url.includes("/admin/report-schedules") || (init?.method ?? "GET").toUpperCase() !== "GET") {
          return null;
        }
        return jsonResponse({
          deployment_id: "dep-1",
          schedules: opts.schedules ?? [],
          count: (opts.schedules ?? []).length,
        });
      },
      (url, init) => {
        if (!url.includes("/admin/commands") || (init?.method ?? "GET").toUpperCase() !== "GET") {
          return null;
        }
        const status = opts.commandsStatus ?? 200;
        if (status !== 200) {
          return jsonResponse({ error: "unauthorized" }, status);
        }
        return jsonResponse({
          commands: opts.commands ?? [],
          count: (opts.commands ?? []).length,
        });
      },
    ],
  });
}

describe("ReadonlyOpsPanel", () => {
  it("renders alert rules, schedules, and command summary", async () => {
    mockOpsApi({ rules: alertRules, schedules: reportSchedules, commands });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/platform"],
      lang: "en",
      children: <ReadonlyOpsPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("Alert thresholds")).toBeInTheDocument();
    });
    expect(screen.getByText("gh-001 temperature > 32")).toBeInTheDocument();
    expect(screen.getByText("gh-001 — 60 min")).toBeInTheDocument();
    expect(screen.getByText("Last 2: ok 1 · failed 1")).toBeInTheDocument();
  });

  it("shows empty messages for each section when data is missing", async () => {
    mockOpsApi({});

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/platform"],
      lang: "en",
      children: <ReadonlyOpsPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("No active thresholds")).toBeInTheDocument();
    });
    expect(screen.getByText("No schedules")).toBeInTheDocument();
    expect(screen.getByText("No commands")).toBeInTheDocument();
  });

  it("expands command details on click", async () => {
    const user = userEvent.setup();
    mockOpsApi({ commands });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/platform"],
      lang: "en",
      children: <ReadonlyOpsPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("Show command details")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Show command details"));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("cmd-ok"))).toBeInTheDocument();
    });
    expect(screen.getByText((content) => content.includes("cmd-fail"))).toBeInTheDocument();
  });

  it("shows a localized unauthorized message on 401", async () => {
    mockOpsApi({ commandsStatus: 401 });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/platform"],
      lang: "en",
      children: <ReadonlyOpsPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("Not signed in or session expired; please sign in again")).toBeInTheDocument();
    });
  });

  it("displays a generic load error when a non-401 request fails", async () => {
    mockOpsApi({ commandsStatus: 500 });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/platform"],
      lang: "en",
      children: <ReadonlyOpsPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("unauthorized")).toBeInTheDocument();
    });
  });
});
