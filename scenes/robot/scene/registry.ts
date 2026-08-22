import type {
  DomainPackOutcomeEvaluationInput,
  IntentPayload,
  OutcomeThresholds,
  RiskLevel,
  SceneTelemetrySlice,
} from "@embodied-agent/core";

export const SCENE_SKILL_IDS = [
  "robot_manual_control",
  "robot_waypoint_navigation",
  "robot_visual_inspection",
  "robot_public_announcement",
  "robot_alarm_response",
  "robot_gimbal_operation",
] as const;

export type SceneSkillId = (typeof SCENE_SKILL_IDS)[number];
export type SceneTrigger = { type: string; [key: string]: unknown };

export function isSceneSkillId(id: string): id is SceneSkillId {
  return (SCENE_SKILL_IDS as readonly string[]).includes(id);
}

export function resolveSceneForTrigger(trigger: SceneTrigger): SceneSkillId | null {
  if (trigger.type === "robot_alarm") return "robot_alarm_response";
  return null;
}

export function resolveSceneFromIntent(intent: IntentPayload): SceneSkillId | null {
  if (intent.skill === "robot.navigate_to_waypoint") return "robot_waypoint_navigation";
  if (
    intent.skill === "robot.capture_image" ||
    intent.skill === "robot.get_stream_url" ||
    intent.skill === "robot.gimbal_capture"
  ) {
    return "robot_visual_inspection";
  }
  if (
    intent.skill === "robot.speak" ||
    intent.skill === "robot.set_volume" ||
    intent.skill === "robot.play_audio" ||
    intent.skill === "robot.stop_audio" ||
    intent.skill === "robot.set_speaker_pitch"
  ) {
    return "robot_public_announcement";
  }
  if (
    intent.skill === "robot.play_alarm" ||
    intent.skill === "robot.stop_alarm" ||
    intent.skill === "robot.set_light"
  ) {
    return "robot_alarm_response";
  }
  if (intent.skill.startsWith("robot.gimbal_")) return "robot_gimbal_operation";
  if (intent.skill.startsWith("robot.")) return "robot_manual_control";
  return null;
}

export function sceneSuccessMetric(
  _scene_skill_id: string,
): "temperature" | "humidity" | "completion" {
  return "completion";
}

/**
 * robot outcome 量化阈值，与飞轮脚本 domain-flywheel-robotics.ts summary 断言对齐：
 * - anomaly_count <= 2（飞轮 "repeated anomaly" 场景断言 anomaly_count === 2）
 * - repeated_anomaly_waypoints <= 1（飞轮断言 repeated_anomaly_waypoints.length === 1）
 */
const ROBOT_OUTCOME_ANOMALY_COUNT_MAX = 2;
const ROBOT_OUTCOME_REPEATED_ANOMALY_WAYPOINTS_MAX = 1;

export type RobotOutcomeMetrics = {
  evidence_count: number;
  anomaly_count: number;
  repeated_anomaly_waypoints: number;
  success: boolean;
};

function numberMetric(slice: SceneTelemetrySlice | undefined, key: string): number {
  if (!slice) return 0;
  const value = slice[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function repeatedAnomalyWaypointCount(slice: SceneTelemetrySlice | undefined): number {
  if (!slice) return 0;
  const value = slice.repeated_anomaly_waypoints;
  return Array.isArray(value) ? value.length : 0;
}

export function extractRobotOutcomeMetrics(
  input: DomainPackOutcomeEvaluationInput,
): RobotOutcomeMetrics {
  const evidence_count = numberMetric(input.after, "evidence_count");
  const anomaly_count = numberMetric(input.after, "anomaly_count");
  const repeated_anomaly_waypoints = repeatedAnomalyWaypointCount(input.after);
  // 失败可见：after 缺失 anomaly_count 遥测时不得判成功（numberMetric 兜 0 会误判 true）。
  const rawAnomalyCount = input.after?.anomaly_count;
  const hasAnomalyTelemetry =
    typeof rawAnomalyCount === "number" && Number.isFinite(rawAnomalyCount);
  const success =
    input.command_status === "completed" &&
    hasAnomalyTelemetry &&
    anomaly_count <= ROBOT_OUTCOME_ANOMALY_COUNT_MAX &&
    repeated_anomaly_waypoints <= ROBOT_OUTCOME_REPEATED_ANOMALY_WAYPOINTS_MAX;
  return { evidence_count, anomaly_count, repeated_anomaly_waypoints, success };
}

export function evaluateOutcomeSuccess(input: DomainPackOutcomeEvaluationInput): boolean {
  return extractRobotOutcomeMetrics(input).success;
}

export function riskLevelForScene(scene_skill_id: string): RiskLevel | undefined {
  if (
    scene_skill_id === "robot_waypoint_navigation" ||
    scene_skill_id === "robot_alarm_response" ||
    scene_skill_id === "robot_gimbal_operation"
  ) {
    return "L2";
  }
  return "L1";
}

export function riskLevelForPhysicalSkill(
  skill: string,
  opts?: { requires_confirmation?: boolean; scene_skill_id?: string },
): RiskLevel {
  if (opts?.requires_confirmation) return "L2";
  if (
    skill === "robot.move" ||
    skill === "robot.navigate_to_waypoint" ||
    skill === "robot.play_alarm" ||
    skill === "robot.play_audio" ||
    skill.startsWith("robot.gimbal_")
  ) {
    return "L2";
  }
  return "L1";
}

export function outcomeThresholdsForScene(_scene_skill_id: string): OutcomeThresholds {
  return {};
}
