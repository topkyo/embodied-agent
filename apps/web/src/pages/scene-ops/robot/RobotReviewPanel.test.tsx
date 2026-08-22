import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { RobotReviewPanel } from "./RobotReviewPanel";
import {
  jsonResponse,
  mockAppFetch,
  renderWithProviders,
  setOpsRoleFromAuth,
  type FetchRouteHandler,
} from "../../../test-utils";
import type { CommandRow } from "../../../api";

afterEach(() => {
  vi.restoreAllMocks();
});

const adminAuth = { user_id: "a1", role: "admin" as const, display_name: "A" };

const robotCommands: CommandRow[] = [
  {
    command_id: "cmd-1",
    scene_skill_id: "robot.move",
    execution_transport: "scene_node_mqtt",
    lifecycle_source: "scene_node_mqtt",
    status: "completed",
    updated_at: "2026-07-14T08:00:00.000Z",
    command: {
      device_id: "m20-001",
      device_type: "robot_dog",
      action: "robot.move",
      issued_by: { user_id: "u1" },
    },
  },
  {
    command_id: "cmd-2",
    status: "pending",
    execution_transport: "api_domain_executor",
    lifecycle_source: "api_domain_executor",
    updated_at: "2026-07-14T08:30:00.000Z",
    command: {
      device_id: "m20-001",
      action: "robot.query_status",
      issued_by: { user_id: "u1" },
    },
  },
  // non-robot command should be filtered out
  {
    command_id: "cmd-3",
    status: "completed",
    updated_at: "2026-07-14T09:00:00.000Z",
    command: {
      device_id: "gh-001",
      action: "ventilation.open",
      issued_by: { user_id: "u1" },
    },
  },
];

function mockCommandsApi(commands: CommandRow[] = robotCommands): ReturnType<typeof mockAppFetch> {
  const routes: FetchRouteHandler[] = [
    (url) => {
      if (url.includes("/admin/commands")) return jsonResponse({ commands, count: commands.length });
      return null;
    },
  ];
  return mockAppFetch({ authMe: adminAuth, routes });
}

describe("RobotReviewPanel", () => {
  it("renders review title and robot commands", async () => {
    mockCommandsApi();
    setOpsRoleFromAuth(adminAuth);

    renderWithProviders({
      lang: "en",
      children: <RobotReviewPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("Robot command review")).toBeInTheDocument();
    });
    expect(screen.getByText("robot.move")).toBeInTheDocument();
    expect(screen.getByText("robot.query_status")).toBeInTheDocument();
  });

  it("filters non-robot commands from the list", async () => {
    mockCommandsApi();
    setOpsRoleFromAuth(adminAuth);

    renderWithProviders({
      lang: "en",
      children: <RobotReviewPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("robot.move")).toBeInTheDocument();
    });
    expect(screen.queryByText("ventilation.open")).not.toBeInTheDocument();
  });

  it("shows empty message when no robot commands", async () => {
    mockCommandsApi([]);
    setOpsRoleFromAuth(adminAuth);

    renderWithProviders({
      lang: "en",
      children: <RobotReviewPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("No robot commands yet.")).toBeInTheDocument();
    });
  });

  it("shows error banner when API fetch fails", async () => {
    const routes: FetchRouteHandler[] = [
      (url) => {
        if (url.includes("/admin/commands")) return jsonResponse({ error: "fetch failed" }, 500);
        return null;
      },
    ];
    mockAppFetch({ authMe: adminAuth, routes, unmatched: "500" });
    setOpsRoleFromAuth(adminAuth);

    renderWithProviders({
      lang: "en",
      children: <RobotReviewPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText(/fetch failed|HTTP 500/)).toBeInTheDocument();
    });
  });

  it("renders command status pills", async () => {
    mockCommandsApi();
    setOpsRoleFromAuth(adminAuth);

    renderWithProviders({
      lang: "en",
      children: <RobotReviewPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("completed")).toBeInTheDocument();
    });
    expect(screen.getByText("pending")).toBeInTheDocument();
  });
});
