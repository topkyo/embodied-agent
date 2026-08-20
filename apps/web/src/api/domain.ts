import { adminFetch } from "./admin-fetch.js";
import type {
  AdminDeploymentsResponse,
  RobotConfig,
  RobotDevice,
  RobotIntentResponse,
  RobotOverview,
  RobotWaypoint,
} from "./settings.js";

export function fetchRobotConfig(): Promise<RobotConfig> {
  return adminFetch("/admin/robot/config");
}

export function saveRobotConfig(patch: {
  m20_base_url: string;
  default_robot_id: string;
  waypoints: RobotWaypoint[];
}): Promise<RobotConfig & { ok: boolean }> {
  return adminFetch("/admin/robot/config", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export function fetchRobotOverview(): Promise<RobotOverview> {
  return adminFetch("/admin/robot/overview");
}

export function saveRobotRegistry(body: {
  robots: RobotDevice[];
  default_robot_id?: string;
}): Promise<{ ok: boolean; robots: RobotDevice[] }> {
  return adminFetch("/admin/robot/registry", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function executeRobotIntent(body: {
  intent: Record<string, unknown>;
  confirmed?: boolean;
}): Promise<RobotIntentResponse> {
  return adminFetch("/admin/robot/intents", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type DomainIntentResponse = {
  reply: string;
  status?: number;
  command_id?: string;
  execution_transport?: string;
  lifecycle_state?: "created" | "sent" | "completed" | "failed";
  requires_confirmation?: boolean;
  reason?: string;
  summary?: string;
  intent?: Record<string, unknown>;
};

export function executeDomainControlAction(body: {
  action_id: string;
  confirmed?: boolean;
}): Promise<DomainIntentResponse> {
  return adminFetch("/admin/domain/control-actions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchDeployments(): Promise<AdminDeploymentsResponse> {
  return adminFetch("/admin/deployments");
}

export function refreshNdviCache() {
  return adminFetch("/admin/satellite/refresh", { method: "POST" });
}

export function refreshGeoLocate(opts?: { force?: boolean; unlock?: boolean }) {
  return adminFetch("/admin/geo/locate", {
    method: "POST",
    body: JSON.stringify(opts ?? { force: true }),
  });
}
