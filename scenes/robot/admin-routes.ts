import type { DeviceRegistry, IntentPayload, RegistryDevice } from "@embodied-agent/core";
import { parseIntentPayload } from "@embodied-agent/core";
import { robotIntentSchemas } from "./schemas/intent-robot.js";
import {
  createM20Client,
  M20HttpError,
  type M20ClientConfig,
  type RobotWaypoint,
} from "./m20/client.js";
import {
  ROBOT_INSPECTION_COLLECTIONS,
  buildRobotInspectionSummaryFromRows,
  type RobotAnomaly,
  type RobotEvidence,
  type RobotInspectionOutcome,
  type RobotInspectionTask,
} from "./scene/inspection-records.js";

type RouteApp = {
  get: (path: string, handler: RouteHandler) => void;
  put: <T = unknown>(path: string, handler: RouteHandler<T>) => void;
  post: <T = unknown>(path: string, handler: RouteHandler<T>) => void;
};

type RouteHandler<T = unknown> = (
  request: { body?: T },
  reply: {
    status: (code: number) => { send: (body: unknown) => unknown };
    send: (body: unknown) => unknown;
  },
) => unknown | Promise<unknown>;

export type RobotAdminSettings = {
  active_domain?: string;
  deployment_id: string;
  domain_configs?: Record<string, unknown>;
};

export type RobotAdminRouteContext = {
  requireAdmin: (request: unknown) => boolean;
  getSettings: () => RobotAdminSettings;
  saveSettings: (patch: Partial<RobotAdminSettings>) => RobotAdminSettings;
  loadRegistry: () => DeviceRegistry;
  saveRegistry: (registry: DeviceRegistry) => DeviceRegistry;
  countPendingConfirms: () => number;
  shouldRequireConfirmation: (intent: IntentPayload) => {
    required: boolean;
    reason: string;
    summary: string;
  };
  executeDomainSkillHandler: (
    intent: IntentPayload,
    context?: { userId?: string },
  ) => Promise<{ reply: string; params: Record<string, unknown> } | null>;
  routeIntent: (
    intent: IntentPayload,
    confirmed: boolean,
  ) => Promise<{
    status: number;
    body: unknown;
  }>;
  listDomainDataRows: <T>(deploymentId: string, collection: string) => T[];
};

type RobotConfigBody = {
  m20_base_url?: string;
  default_robot_id?: string;
  waypoints?: RobotWaypoint[];
};

function robotConfig(context: RobotAdminRouteContext): RobotConfigBody {
  return (context.getSettings().domain_configs?.robotics ?? {}) as RobotConfigBody;
}

function robotsForDeployment(context: RobotAdminRouteContext): RegistryDevice[] {
  const settings = context.getSettings();
  return context
    .loadRegistry()
    .devices.filter(
      (device) =>
        device.deployment_id === settings.deployment_id &&
        device.device_type === "robot_dog" &&
        device.status !== "disabled",
    );
}

function validateWaypoints(value: unknown): RobotWaypoint[] {
  if (!Array.isArray(value)) {
    throw new Error("waypoints 必须是数组。");
  }
  return value.map((waypoint, idx) => {
    if (!waypoint || typeof waypoint !== "object") {
      throw new Error(`waypoints[${idx}] 必须是对象。`);
    }
    const row = waypoint as Record<string, unknown>;
    const waypoint_id = typeof row.waypoint_id === "string" ? row.waypoint_id.trim() : "";
    if (!waypoint_id) {
      throw new Error(`waypoints[${idx}] 缺少 waypoint_id。`);
    }
    if (!Array.isArray(row.points) || row.points.length === 0) {
      throw new Error(`waypoints[${idx}] 缺少 points 数组。`);
    }
    return {
      waypoint_id,
      ...(typeof row.name === "string" && row.name.trim() ? { name: row.name.trim() } : {}),
      points: row.points as Array<Record<string, unknown>>,
    };
  });
}

function validateRobotConfig(
  context: RobotAdminRouteContext,
  body: RobotConfigBody,
): Required<RobotConfigBody> {
  const m20_base_url = body.m20_base_url?.trim() ?? "";
  const default_robot_id = body.default_robot_id?.trim() ?? "";
  if (!m20_base_url) throw new Error("m20_base_url 不能为空。");
  try {
    new URL(m20_base_url);
  } catch {
    throw new Error("m20_base_url 必须是有效 URL。");
  }
  if (!default_robot_id) throw new Error("default_robot_id 不能为空。");
  const robots = robotsForDeployment(context);
  if (!robots.some((robot) => robot.device_id === default_robot_id)) {
    throw new Error(
      `default_robot_id 未在当前 deployment 的 robot_dog registry 中注册：${default_robot_id}`,
    );
  }
  return {
    m20_base_url,
    default_robot_id,
    waypoints: validateWaypoints(body.waypoints ?? []),
  };
}

function parseRobotIntent(input: unknown): IntentPayload {
  const intent = parseIntentPayload(input, robotIntentSchemas);
  if (!intent.skill.startsWith("robot.")) {
    throw new Error("只允许 robot.* intent。");
  }
  return intent;
}

function m20Error(error: unknown): { message: string; code: string; status?: number } {
  if (error instanceof M20HttpError) {
    return { message: error.message, code: error.code, status: error.status };
  }
  return {
    message: error instanceof Error ? error.message : String(error),
    code: "m20_failed",
  };
}

async function safeM20<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error: m20Error(error).message };
  }
}

export function registerDomainPackAdminRoutes(
  app: RouteApp,
  context: RobotAdminRouteContext,
): void {
  app.get("/admin/robot/config", async (request, reply) => {
    if (!context.requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const settings = context.getSettings();
    const cfg = robotConfig(context);
    return {
      active_domain: settings.active_domain,
      m20_base_url: cfg.m20_base_url ?? "",
      default_robot_id: cfg.default_robot_id ?? "",
      waypoints: cfg.waypoints ?? [],
      robots: robotsForDeployment(context),
    };
  });

  app.put<RobotConfigBody>("/admin/robot/config", async (request, reply) => {
    if (!context.requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    try {
      const robotics = validateRobotConfig(context, request.body ?? {});
      const current = context.getSettings();
      const saved = context.saveSettings({
        active_domain: "robotics",
        domain_configs: {
          ...(current.domain_configs ?? {}),
          robotics,
        },
      });
      return {
        ok: true,
        active_domain: saved.active_domain,
        ...((saved.domain_configs?.robotics ?? {}) as RobotConfigBody),
        robots: robotsForDeployment(context),
      };
    } catch (error) {
      return reply.status(400).send({
        error: error instanceof Error ? error.message : "invalid_robot_config",
      });
    }
  });

  app.get("/admin/robot/overview", async (request, reply) => {
    if (!context.requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const settings = context.getSettings();
    const cfg = robotConfig(context);
    const robots = robotsForDeployment(context);
    const configured = Boolean(
      cfg.m20_base_url?.trim() &&
      cfg.default_robot_id?.trim() &&
      robots.some((robot) => robot.device_id === cfg.default_robot_id),
    );
    const m20 = createM20Client(() => cfg as M20ClientConfig);
    const [status, sensors, obstacle, pose, navigation] = configured
      ? await Promise.all([
          safeM20(() => m20.bodyStatus()),
          safeM20(() => m20.sensors()),
          safeM20(() => m20.obstacle()),
          safeM20(() => m20.pose()),
          safeM20(() => m20.navStatus()),
        ])
      : [];
    const failures = [status, sensors, obstacle, pose, navigation]
      .filter((row): row is { ok: false; error: string } => Boolean(row && !row.ok))
      .map((row) => row.error);
    return {
      active_domain: settings.active_domain,
      configured,
      robots,
      default_robot_id: cfg.default_robot_id ?? "",
      pending_confirms_count: context.countPendingConfirms(),
      m20: {
        ok: configured && failures.length === 0,
        ...(status?.ok ? { status: status.value } : {}),
        ...(sensors?.ok ? { sensors: sensors.value } : {}),
        ...(obstacle?.ok ? { obstacle: obstacle.value } : {}),
        ...(pose?.ok ? { pose: pose.value } : {}),
        ...(navigation?.ok ? { navigation: navigation.value } : {}),
        ...(failures.length > 0 ? { error: failures.join("；") } : {}),
        ...(!configured ? { error: "robot 场景未完成 M20 URL、默认机器人或 registry 配置。" } : {}),
      },
    };
  });

  app.post<{
    waypoint_id?: string;
    source?: "body" | "gimbal";
    objective?: string;
    robot_id?: string;
  }>("/admin/robot/inspections", async (request, reply) => {
    if (!context.requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const waypoint_id = request.body?.waypoint_id?.trim();
    if (!waypoint_id) {
      return reply.status(400).send({ error: "waypoint_id 不能为空。" });
    }
    try {
      const result = await context.executeDomainSkillHandler(
        {
          skill: "robot.start_inspection",
          target: request.body?.robot_id ? { robot_id: request.body.robot_id } : {},
          parameters: {
            waypoint_id,
            source: request.body?.source ?? "body",
            objective: request.body?.objective ?? "巡检取证",
          },
        },
        { userId: "admin" },
      );
      if (!result) {
        return reply.status(400).send({ error: "robot inspection skill not available" });
      }
      return { ok: true, reply: result.reply, ...result.params };
    } catch (error) {
      return reply.status(503).send({
        error: error instanceof Error ? error.message : "robot_inspection_failed",
      });
    }
  });

  app.get("/admin/robot/inspections", async (request, reply) => {
    if (!context.requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const deployment_id = context.getSettings().deployment_id;
    const tasks = context.listDomainDataRows<RobotInspectionTask>(
      deployment_id,
      ROBOT_INSPECTION_COLLECTIONS.tasks,
    );
    const evidence = context.listDomainDataRows<RobotEvidence>(
      deployment_id,
      ROBOT_INSPECTION_COLLECTIONS.evidence,
    );
    const anomalies = context.listDomainDataRows<RobotAnomaly>(
      deployment_id,
      ROBOT_INSPECTION_COLLECTIONS.anomalies,
    );
    const outcomes = context.listDomainDataRows<RobotInspectionOutcome>(
      deployment_id,
      ROBOT_INSPECTION_COLLECTIONS.outcomes,
    );
    return { deployment_id, tasks, evidence, anomalies, outcomes };
  });

  app.get("/admin/robot/inspection-summary", async (request, reply) => {
    if (!context.requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const deployment_id = context.getSettings().deployment_id;
    return buildRobotInspectionSummaryFromRows({
      deployment_id,
      tasks: context.listDomainDataRows<RobotInspectionTask>(
        deployment_id,
        ROBOT_INSPECTION_COLLECTIONS.tasks,
      ),
      evidence: context.listDomainDataRows<RobotEvidence>(
        deployment_id,
        ROBOT_INSPECTION_COLLECTIONS.evidence,
      ),
      anomalies: context.listDomainDataRows<RobotAnomaly>(
        deployment_id,
        ROBOT_INSPECTION_COLLECTIONS.anomalies,
      ),
    });
  });

  app.put<{ robots?: RegistryDevice[]; default_robot_id?: string }>(
    "/admin/robot/registry",
    async (request, reply) => {
      if (!context.requireAdmin(request)) {
        return reply.status(401).send({ error: "unauthorized" });
      }
      try {
        const settings = context.getSettings();
        const robots = request.body?.robots ?? [];
        if (!Array.isArray(robots)) throw new Error("robots 必须是数组。");
        const normalized = robots.map((robot) => ({
          ...robot,
          deployment_id: settings.deployment_id,
          device_type: "robot_dog" as const,
          node_id: robot.node_id || robot.device_id,
          transport: "m20_http" as const,
          aliases: Array.isArray(robot.aliases) ? robot.aliases : [],
          status: robot.status ?? "active",
        }));
        const registry = context.loadRegistry();
        const otherDevices = registry.devices.filter(
          (device) =>
            !(
              device.deployment_id === settings.deployment_id && device.device_type === "robot_dog"
            ),
        );
        const existingNodes = new Map((registry.nodes ?? []).map((node) => [node.node_id, node]));
        const robotNodes = normalized.map((robot) => ({
          node_id: robot.node_id,
          deployment_id: robot.deployment_id,
          status:
            existingNodes.get(robot.node_id)?.status ??
            (robot.status === "maintenance"
              ? "maintenance"
              : robot.status === "disabled"
                ? "disabled"
                : "active"),
          name: existingNodes.get(robot.node_id)?.name ?? robot.name,
        }));
        const otherNodes = (registry.nodes ?? []).filter(
          (node) => !robotNodes.some((robotNode) => robotNode.node_id === node.node_id),
        );
        const saved = context.saveRegistry({
          ...registry,
          nodes: [...otherNodes, ...robotNodes],
          devices: [...otherDevices, ...normalized],
        });
        const default_robot_id = request.body?.default_robot_id?.trim();
        if (default_robot_id) {
          if (!normalized.some((robot) => robot.device_id === default_robot_id)) {
            throw new Error(`default_robot_id 不在 robots 列表中：${default_robot_id}`);
          }
          const current = context.getSettings();
          const currentRobotics = (current.domain_configs?.robotics ?? {}) as RobotConfigBody;
          context.saveSettings({
            domain_configs: {
              ...(current.domain_configs ?? {}),
              robotics: {
                ...currentRobotics,
                default_robot_id,
              },
            },
          });
        }
        return { ok: true, registry: saved, robots: robotsForDeployment(context) };
      } catch (error) {
        return reply.status(400).send({
          error: error instanceof Error ? error.message : "invalid_robot_registry",
        });
      }
    },
  );

  app.post<{ intent?: unknown; confirmed?: boolean }>(
    "/admin/robot/intents",
    async (request, reply) => {
      if (!context.requireAdmin(request)) {
        return reply.status(401).send({ error: "unauthorized" });
      }
      let intent: IntentPayload;
      try {
        intent = parseRobotIntent(request.body?.intent);
      } catch (error) {
        return reply.status(400).send({
          error: error instanceof Error ? error.message : "invalid_robot_intent",
        });
      }
      const confirmation = context.shouldRequireConfirmation(intent);
      if (confirmation.required && request.body?.confirmed !== true) {
        return reply.status(409).send({
          requires_confirmation: true,
          reason: confirmation.reason,
          summary: confirmation.summary,
        });
      }
      const routed = await context.routeIntent(intent, request.body?.confirmed === true);
      return reply.status(routed.status).send(routed.body);
    },
  );
}
