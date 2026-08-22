import type { DomainPackSkillHandlerResult, IntentPayload } from "@embodied-agent/core";
import {
  createM20Client,
  defaultRobotId,
  resolveRobotWaypoint,
  type M20ClientConfig,
  type M20InspectionEvidence,
} from "../m20/client.js";
import {
  ROBOT_INSPECTION_COLLECTIONS,
  buildRobotInspectionSummaryFromRows,
  createRobotAnomaly,
  createRobotEvidence,
  createRobotInspectionOutcome,
  createRobotInspectionTask,
  type RobotAnomaly,
  type RobotEvidence,
  type RobotInspectionTask,
} from "./inspection-records.js";

type DomainDataStoreServices = {
  append: <T extends Record<string, unknown>>(
    deploymentId: string,
    collection: string,
    row: T,
  ) => T;
  list: <T = Record<string, unknown>>(deploymentId: string, collection: string) => T[];
};

const INSPECTION_SKILLS = new Set(["robot.start_inspection", "robot.query_inspection_summary"]);

export function canHandleRobotInspectionSkill(intent: IntentPayload): boolean {
  return INSPECTION_SKILLS.has(intent.skill);
}

function configFromUnknown(value: unknown): M20ClientConfig {
  if (!value || typeof value !== "object") return {};
  return value as M20ClientConfig;
}

function domainDataStore(context: { services?: Record<string, unknown> }): DomainDataStoreServices {
  const value = context.services?.domainDataStore;
  if (!value || typeof value !== "object") {
    throw new Error("robotics inspection handler 缺少 domainDataStore 服务。");
  }
  const store = value as Partial<DomainDataStoreServices>;
  if (typeof store.append !== "function" || typeof store.list !== "function") {
    throw new Error("domainDataStore 服务必须提供 append/list。");
  }
  return store as DomainDataStoreServices;
}

function normalizeEvidence(raw: M20InspectionEvidence): Required<M20InspectionEvidence> {
  return {
    source_kind: raw.source_kind ?? "m20",
    image_url: raw.image_url ?? "",
    captured_at: raw.captured_at ?? new Date().toISOString(),
    summary: raw.summary ?? "巡检取证已完成。",
    anomalies: raw.anomalies ?? [],
  };
}

export async function handleRobotInspectionSkill(
  intent: IntentPayload,
  context: {
    domainConfig?: unknown;
    deploymentId: string;
    userId?: string;
    services?: Record<string, unknown>;
  },
): Promise<DomainPackSkillHandlerResult> {
  const deploymentId = context.deploymentId;
  const store = domainDataStore(context);
  const cfg = configFromUnknown(context.domainConfig);

  if (intent.skill === "robot.query_inspection_summary") {
    const summary = buildRobotInspectionSummaryFromRows({
      deployment_id: deploymentId,
      tasks: store.list<RobotInspectionTask>(deploymentId, ROBOT_INSPECTION_COLLECTIONS.tasks),
      evidence: store.list<RobotEvidence>(deploymentId, ROBOT_INSPECTION_COLLECTIONS.evidence),
      anomalies: store.list<RobotAnomaly>(deploymentId, ROBOT_INSPECTION_COLLECTIONS.anomalies),
    });
    const repeated = summary.repeated_anomaly_waypoints as
      Array<{ suggestion?: string }> | undefined;
    const suggestion = repeated?.[0]?.suggestion ?? "暂无重复异常点位，保持当前巡检频率。";
    return {
      reply:
        `机器人巡检：任务 ${summary.task_count} 次，证据 ${summary.evidence_count} 条，` +
        `异常 ${summary.anomaly_count} 条。${suggestion}`,
      params: summary,
    };
  }

  if (intent.skill !== "robot.start_inspection") {
    return { reply: "暂不支持该机器人巡检技能。", params: {} };
  }

  const p = intent.parameters as {
    waypoint_id: string;
    source?: "body" | "gimbal";
    objective?: string;
  };
  resolveRobotWaypoint(cfg, p.waypoint_id);
  const robotId = (intent.target.robot_id as string | undefined) ?? defaultRobotId(cfg);
  const source = p.source ?? "body";
  const objective = p.objective ?? "巡检取证";
  const m20 = createM20Client(() => cfg);

  try {
    const raw = normalizeEvidence(
      await m20.inspect({
        waypoint_id: p.waypoint_id,
        source,
        objective,
      }),
    );
    const task = store.append(
      deploymentId,
      ROBOT_INSPECTION_COLLECTIONS.tasks,
      createRobotInspectionTask({
        deployment_id: deploymentId,
        robot_id: robotId,
        waypoint_id: p.waypoint_id,
        objective,
        source,
        status: "completed",
        created_by: context.userId ?? "unknown",
        completed_at: raw.captured_at,
      }),
    );
    const taskId = String(task.task_id ?? "");
    const evidence = store.append(
      deploymentId,
      ROBOT_INSPECTION_COLLECTIONS.evidence,
      createRobotEvidence({
        task_id: taskId,
        deployment_id: deploymentId,
        robot_id: robotId,
        waypoint_id: p.waypoint_id,
        source,
        source_kind: raw.source_kind,
        image_url: raw.image_url,
        captured_at: raw.captured_at,
        summary: raw.summary,
        anomaly_kinds: raw.anomalies.map((a) => a.kind),
        confidence: raw.anomalies[0]?.confidence,
      }),
    );
    const evidenceId = String(evidence.evidence_id ?? "");
    const anomalies = raw.anomalies.map((anomaly) =>
      store.append(
        deploymentId,
        ROBOT_INSPECTION_COLLECTIONS.anomalies,
        createRobotAnomaly({
          task_id: taskId,
          evidence_id: evidenceId,
          deployment_id: deploymentId,
          robot_id: robotId,
          waypoint_id: p.waypoint_id,
          kind: anomaly.kind,
          severity: anomaly.severity ?? "L1",
          description: anomaly.description ?? raw.summary,
          detected_at: raw.captured_at,
        }),
      ),
    );
    const outcome = store.append(
      deploymentId,
      ROBOT_INSPECTION_COLLECTIONS.outcomes,
      createRobotInspectionOutcome({
        task_id: taskId,
        deployment_id: deploymentId,
        robot_id: robotId,
        waypoint_id: p.waypoint_id,
        success: true,
        evidence_count: 1,
        anomaly_count: anomalies.length,
        recommendation: anomalies.length > 0 ? "建议安排人工复核并提高该点位巡检频率。" : undefined,
        completed_at: raw.captured_at,
      }),
    );
    return {
      reply:
        anomalies.length > 0
          ? `巡检取证完成：${p.waypoint_id} 发现 ${anomalies.length} 个异常。`
          : `巡检取证完成：${p.waypoint_id} 未见明显异常。`,
      params: {
        task,
        evidence,
        anomalies,
        outcome,
      },
    };
  } catch (e) {
    const task = store.append(
      deploymentId,
      ROBOT_INSPECTION_COLLECTIONS.tasks,
      createRobotInspectionTask({
        deployment_id: deploymentId,
        robot_id: robotId,
        waypoint_id: p.waypoint_id,
        objective,
        source,
        status: "failed",
        created_by: context.userId ?? "unknown",
        completed_at: new Date().toISOString(),
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    store.append(
      deploymentId,
      ROBOT_INSPECTION_COLLECTIONS.outcomes,
      createRobotInspectionOutcome({
        task_id: String(task?.task_id ?? ""),
        deployment_id: deploymentId,
        robot_id: robotId,
        waypoint_id: p.waypoint_id,
        success: false,
        evidence_count: 0,
        anomaly_count: 0,
        recommendation: "巡检取证失败，请检查 M20 连接和点位配置。",
        completed_at: new Date().toISOString(),
      }),
    );
    throw e;
  }
}
