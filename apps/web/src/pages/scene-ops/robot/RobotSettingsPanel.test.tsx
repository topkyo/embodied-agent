import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RobotSettingsPanel } from "./RobotSettingsPanel";
import { DomainPackProvider } from "../../../contexts/DomainPackContext";
import {
  jsonResponse,
  mockAppFetch,
  renderWithProviders,
  setOpsRoleFromAuth,
  type FetchRouteHandler,
} from "../../../test-utils";
import type { LiveDomainPackMeta } from "../../../lib/domain-packs";
import type { RobotConfig } from "../../../api";

afterEach(() => {
  vi.restoreAllMocks();
});

const adminAuth = { user_id: "a1", role: "admin" as const, display_name: "A" };
const userAuth = { user_id: "u1", role: "user" as const, display_name: "U" };

const robotPack: LiveDomainPackMeta = {
  slug: "robot",
  displayNameKey: "scenes.robot.tag",
  status: "live",
  runtimeStatus: "live",
  scenePath: "/scenes/robot",
  packId: "robotics",
  opsPath: "/scenes/robot/ops",
  opsEnabled: true,
};

const robotConfig: RobotConfig = {
  active_domain: "robotics",
  m20_base_url: "http://127.0.0.1:3099",
  default_robot_id: "m20-001",
  waypoints: [{ waypoint_id: "wp-1", name: "A", points: [{ x: 1 }] }],
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
  ],
};

function mockRobotSettingsApi(
  cfg: RobotConfig = robotConfig,
  auth: { user_id: string; role: "admin" | "user"; display_name: string } = adminAuth,
): ReturnType<typeof mockAppFetch> {
  const routes: FetchRouteHandler[] = [
    (url) => {
      if (url.includes("/admin/robot/config")) return jsonResponse(cfg);
      return null;
    },
    (url, init) => {
      if (url.includes("/admin/settings") && (init?.method ?? "").toUpperCase() === "PUT") {
        return jsonResponse({ ok: true });
      }
      return null;
    },
  ];
  return mockAppFetch({ authMe: auth, activeDomain: "robotics", routes });
}

describe("RobotSettingsPanel", () => {
  it("renders config form with m20 URL and waypoints for admin when robotics active", async () => {
    mockRobotSettingsApi();
    setOpsRoleFromAuth(adminAuth);

    renderWithProviders({
      lang: "en",
      children: (
        <DomainPackProvider pack={robotPack} activeDomain="robotics">
          <RobotSettingsPanel />
        </DomainPackProvider>
      ),
    });

    await waitFor(() => {
      expect(screen.getByText("Robotics Domain Pack configuration")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("http://127.0.0.1:3099")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save configuration/ })).toBeInTheDocument();
    expect(screen.getByText(/Saves via unified/)).toBeInTheDocument();
  });

  it("shows unenabled banner and disables save when robotics is not active", async () => {
    const inactiveCfg: RobotConfig = { ...robotConfig, active_domain: "agriculture" };
    const routes: FetchRouteHandler[] = [
      (url) => {
        if (url.includes("/admin/robot/config")) return jsonResponse(inactiveCfg);
        return null;
      },
    ];
    mockAppFetch({ authMe: adminAuth, activeDomain: "agriculture", routes });
    setOpsRoleFromAuth(adminAuth);

    renderWithProviders({
      lang: "en",
      children: (
        <DomainPackProvider pack={robotPack} activeDomain="agriculture">
          <RobotSettingsPanel />
        </DomainPackProvider>
      ),
    });

    await waitFor(() => {
      expect(screen.getByText(/active_domain is not robotics/)).toBeInTheDocument();
    });
    const saveBtn = screen.getByRole("button", { name: /Save configuration/ });
    expect(saveBtn).toBeDisabled();
  });

  it("disables save button for non-admin user", async () => {
    mockRobotSettingsApi(robotConfig, userAuth);
    setOpsRoleFromAuth(userAuth);

    renderWithProviders({
      lang: "en",
      children: (
        <DomainPackProvider pack={robotPack} activeDomain="robotics">
          <RobotSettingsPanel />
        </DomainPackProvider>
      ),
    });

    await waitFor(() => {
      expect(screen.getByText("Robotics Domain Pack configuration")).toBeInTheDocument();
    });
    const saveBtn = screen.getByRole("button", { name: /Save configuration/ });
    expect(saveBtn).toBeDisabled();
  });

  it("saves config and shows success message", async () => {
    const user = userEvent.setup();
    mockRobotSettingsApi();
    setOpsRoleFromAuth(adminAuth);

    renderWithProviders({
      lang: "en",
      children: (
        <DomainPackProvider pack={robotPack} activeDomain="robotics">
          <RobotSettingsPanel />
        </DomainPackProvider>
      ),
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Save configuration/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Save configuration/ }));

    await waitFor(() => {
      expect(screen.getByText(/configuration saved/)).toBeInTheDocument();
    });
  });

  it("shows error when waypoints JSON is invalid", async () => {
    const user = userEvent.setup();
    mockRobotSettingsApi();
    setOpsRoleFromAuth(adminAuth);

    renderWithProviders({
      lang: "en",
      children: (
        <DomainPackProvider pack={robotPack} activeDomain="robotics">
          <RobotSettingsPanel />
        </DomainPackProvider>
      ),
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Save configuration/ })).toBeInTheDocument();
    });

    const textarea = screen.getByRole("textbox", { name: /Waypoints JSON/ });
    await user.clear(textarea);
    await user.type(textarea, "not-json");

    await user.click(screen.getByRole("button", { name: /Save configuration/ }));

    await waitFor(() => {
      expect(screen.getAllByText(/SyntaxError|Unexpected|JSON/).length).toBeGreaterThan(0);
    });
  });
});
