import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { RobotOverviewPanel } from "./RobotOverviewPanel";
import {
  jsonResponse,
  mockAppFetch,
  renderWithProviders,
  setOpsRoleFromAuth,
  type FetchRouteHandler,
} from "../../../test-utils";
import type { CommandRow, RobotOverview } from "../../../api";

afterEach(() => {
  vi.restoreAllMocks();
});

const adminAuth = { user_id: "a1", role: "admin" as const, display_name: "A" };

const overviewActive: RobotOverview = {
  active_domain: "robotics",
  configured: true,
  robots: [],
  default_robot_id: "m20-001",
  pending_confirms_count: 0,
  m20: {
    ok: true,
    status: { state: "idle" },
    sensors: { temp: 42 },
    obstacle: { detected: false },
    pose: { x: 0, y: 0 },
    navigation: { mode: "auto" },
  },
};

const overviewInactive: RobotOverview = {
  ...overviewActive,
  active_domain: "agriculture",
  configured: false,
  default_robot_id: "",
  pending_confirms_count: 2,
  m20: { ok: false, error: "M20 unreachable" },
};

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

function mockRobotOverviewApi(
  overview: RobotOverview = overviewActive,
  commands: CommandRow[] = robotCommands,
): ReturnType<typeof mockAppFetch> {
  const routes: FetchRouteHandler[] = [
    (url) => {
      if (url.includes("/admin/robot/overview")) return jsonResponse(overview);
      return null;
    },
    (url) => {
      if (url.includes("/admin/commands")) return jsonResponse({ commands, count: commands.length });
      return null;
    },
  ];
  return mockAppFetch({ authMe: adminAuth, routes });
}

describe("RobotOverviewPanel", () => {
  it("renders status cards when active domain is robotics", async () => {
    mockRobotOverviewApi();
    setOpsRoleFromAuth(adminAuth);

    renderWithProviders({
      lang: "en",
      children: <RobotOverviewPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("Robot status")).toBeInTheDocument();
    });
    expect(screen.getByText("Domain Pack")).toBeInTheDocument();
    expect(screen.getByText("M20 API")).toBeInTheDocument();
    expect(screen.getByText("Default robot")).toBeInTheDocument();
    expect(screen.getByText("m20-001")).toBeInTheDocument();
    expect(screen.getByText("connected")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // pending count
  });

  it("shows inactive banner when active_domain is not robotics", async () => {
    mockRobotOverviewApi(overviewInactive);
    setOpsRoleFromAuth(adminAuth);

    renderWithProviders({
      lang: "en",
      children: <RobotOverviewPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText(/robotics ops is only for configuration/)).toBeInTheDocument();
    });
    expect(screen.getByText("partial")).toBeInTheDocument();
    expect(screen.getByText("M20 unreachable")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // pending count
  });

  it("does not render a duplicate recent commands list", async () => {
    mockRobotOverviewApi();
    setOpsRoleFromAuth(adminAuth);

    renderWithProviders({
      lang: "en",
      children: <RobotOverviewPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("Robot status")).toBeInTheDocument();
    });
    expect(screen.queryByText("Recent robot commands")).not.toBeInTheDocument();
    expect(screen.queryByText(/robot\.move/)).not.toBeInTheDocument();
  });

  it("shows error banner when API fetch fails", async () => {
    const routes: FetchRouteHandler[] = [
      (url) => {
        if (url.includes("/admin/robot/overview")) return jsonResponse({ error: "boom" }, 500);
        return null;
      },
    ];
    mockAppFetch({ authMe: adminAuth, routes, unmatched: "500" });
    setOpsRoleFromAuth(adminAuth);

    renderWithProviders({
      lang: "en",
      children: <RobotOverviewPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText(/boom|HTTP 500/)).toBeInTheDocument();
    });
  });
});
