import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RobotDevicesPanel } from "./RobotDevicesPanel";
import {
  jsonResponse,
  mockAppFetch,
  renderWithProviders,
  setOpsRoleFromAuth,
  type FetchRouteHandler,
} from "../../../test-utils";
import type { RobotConfig } from "../../../api";

afterEach(() => {
  vi.restoreAllMocks();
});

const adminAuth = { user_id: "a1", role: "admin" as const, display_name: "A" };
const userAuth = { user_id: "u1", role: "user" as const, display_name: "U" };

const robotConfig: RobotConfig = {
  active_domain: "robotics",
  m20_base_url: "http://127.0.0.1:3099",
  default_robot_id: "m20-001",
  waypoints: [],
  robots: [
    {
      device_id: "m20-001",
      deployment_id: "dep-1",
      device_type: "robot_dog",
      name: "Spot",
      aliases: [],
      node_id: "node-1",
      status: "active",
    },
    {
      device_id: "m20-002",
      deployment_id: "dep-1",
      device_type: "robot_dog",
      name: "Rover",
      aliases: [],
      node_id: "node-2",
      status: "offline",
    },
  ],
};

function mockRobotConfigApi(
  cfg: RobotConfig = robotConfig,
  auth: { user_id: string; role: "admin" | "user"; display_name: string } = adminAuth,
): ReturnType<typeof mockAppFetch> {
  const routes: FetchRouteHandler[] = [
    (url) => {
      if (url.includes("/admin/robot/config")) return jsonResponse(cfg);
      return null;
    },
    (url, init) => {
      if (url.includes("/admin/robot/registry") && (init?.method ?? "").toUpperCase() === "PUT") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          robots: unknown[];
          default_robot_id: string;
        };
        return jsonResponse({ ok: true, robots: body.robots });
      }
      return null;
    },
  ];
  return mockAppFetch({ authMe: auth, routes });
}

describe("RobotDevicesPanel", () => {
  it("renders registry with robot options for admin", async () => {
    mockRobotConfigApi();
    setOpsRoleFromAuth(adminAuth);

    renderWithProviders({
      lang: "en",
      children: <RobotDevicesPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("Robot Registry")).toBeInTheDocument();
    });
    expect(screen.getByRole("option", { name: /Spot \(m20-001\)/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Rover \(m20-002\)/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save registry" }),
    ).toBeInTheDocument();
  });

  it("shows admin-only banner and disables save for non-admin user", async () => {
    mockRobotConfigApi(robotConfig, userAuth);
    setOpsRoleFromAuth(userAuth);

    renderWithProviders({
      lang: "en",
      children: <RobotDevicesPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("Admin access required")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Save registry" })).not.toBeInTheDocument();
    // select should be disabled
    const select = screen.getByRole("combobox");
    expect(select).toBeDisabled();
  });

  it("shows empty registry banner when robots array is empty", async () => {
    const emptyCfg: RobotConfig = { ...robotConfig, robots: [], default_robot_id: "" };
    mockRobotConfigApi(emptyCfg);
    setOpsRoleFromAuth(adminAuth);

    renderWithProviders({
      lang: "en",
      children: <RobotDevicesPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText(/No robot_dog registry yet/)).toBeInTheDocument();
    });
  });

  it("saves registry and shows success message", async () => {
    const user = userEvent.setup();
    mockRobotConfigApi();
    setOpsRoleFromAuth(adminAuth);

    renderWithProviders({
      lang: "en",
      children: <RobotDevicesPanel />,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save registry" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Save registry" }));

    await waitFor(() => {
      expect(screen.getByText("robot_dog registry saved.")).toBeInTheDocument();
    });
  });

  it("shows error when saving with invalid JSON", async () => {
    const user = userEvent.setup();
    mockRobotConfigApi();
    setOpsRoleFromAuth(adminAuth);

    renderWithProviders({
      lang: "en",
      children: <RobotDevicesPanel />,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save registry" })).toBeInTheDocument();
    });

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.clear(textarea);
    await user.type(textarea, "not-json");

    await user.click(screen.getByRole("button", { name: "Save registry" }));

    await waitFor(() => {
      expect(screen.getAllByText(/SyntaxError|Unexpected|JSON/).length).toBeGreaterThan(0);
    });
  });
});
