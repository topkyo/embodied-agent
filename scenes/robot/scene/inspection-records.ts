export const ROBOT_INSPECTION_COLLECTIONS = {
  tasks: "robot.inspection.tasks",
  evidence: "robot.inspection.evidence",
  anomalies: "robot.inspection.anomalies",
  outcomes: "robot.inspection.outcomes",
} as const;

export type RobotInspectionStatus = "completed" | "failed";
export type RobotAnomalyKind = "blocked_path" | "hotspot" | "person_risk";

export type RobotInspectionTask = {
  task_id: string;
  deployment_id: string;
  robot_id: string;
  waypoint_id: string;
  objective: string;
  source: "body" | "gimbal";
  status: RobotInspectionStatus;
  created_by: string;
  created_at: string;
  completed_at?: string;
  error?: string;
};

export type RobotEvidence = {
  evidence_id: string;
  task_id: string;
  deployment_id: string;
  robot_id: string;
  waypoint_id: string;
  source: "body" | "gimbal";
  source_kind: "stub" | "m20";
  image_url?: string;
  captured_at: string;
  summary: string;
  anomaly_kinds: RobotAnomalyKind[];
  confidence?: number;
};

export type RobotAnomaly = {
  anomaly_id: string;
  task_id: string;
  evidence_id: string;
  deployment_id: string;
  robot_id: string;
  waypoint_id: string;
  kind: RobotAnomalyKind;
  severity: "L1" | "L2";
  description: string;
  detected_at: string;
};

export type RobotInspectionOutcome = {
  outcome_id: string;
  task_id: string;
  deployment_id: string;
  robot_id: string;
  waypoint_id: string;
  success: boolean;
  evidence_count: number;
  anomaly_count: number;
  recommendation?: string;
  completed_at: string;
};

export type RobotInspectionSummary = {
  deployment_id: string;
  task_count: number;
  evidence_count: number;
  anomaly_count: number;
  repeated_anomaly_waypoints: Array<{
    waypoint_id: string;
    count: number;
    suggestion: string;
  }>;
};

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createRobotInspectionTask(
  row: Omit<RobotInspectionTask, "task_id" | "created_at">,
): RobotInspectionTask {
  return {
    task_id: id("rit"),
    created_at: new Date().toISOString(),
    ...row,
  };
}

export function createRobotEvidence(row: Omit<RobotEvidence, "evidence_id">): RobotEvidence {
  return { evidence_id: id("rev"), ...row };
}

export function createRobotAnomaly(row: Omit<RobotAnomaly, "anomaly_id">): RobotAnomaly {
  return { anomaly_id: id("ran"), ...row };
}

export function createRobotInspectionOutcome(
  row: Omit<RobotInspectionOutcome, "outcome_id">,
): RobotInspectionOutcome {
  return { outcome_id: id("rio"), ...row };
}

export function buildRobotInspectionSummaryFromRows(input: {
  deployment_id: string;
  tasks: RobotInspectionTask[];
  evidence: RobotEvidence[];
  anomalies: RobotAnomaly[];
}): RobotInspectionSummary {
  const byWaypoint = new Map<string, number>();
  for (const anomaly of input.anomalies) {
    byWaypoint.set(anomaly.waypoint_id, (byWaypoint.get(anomaly.waypoint_id) ?? 0) + 1);
  }
  const repeated_anomaly_waypoints = [...byWaypoint.entries()]
    .filter(([, count]) => count >= 2)
    .map(([waypoint_id, count]) => ({
      waypoint_id,
      count,
      suggestion: `${waypoint_id} 连续出现 ${count} 次异常，建议提高巡检频率并安排人工复核。`,
    }));
  return {
    deployment_id: input.deployment_id,
    task_count: input.tasks.length,
    evidence_count: input.evidence.length,
    anomaly_count: input.anomalies.length,
    repeated_anomaly_waypoints,
  };
}
