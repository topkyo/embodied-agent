import type {
  DomainPackSafetyContext,
  DomainPackSafetyDecision,
  DomainPackSafetyPolicy,
  IntentPayload,
} from "@embodied-agent/core";
import { ROBOT_PHYSICAL_SKILLS } from "../skills.js";

const ROBOT_QUERY_SKILLS = [
  "robot.query_status",
  "robot.query_pose",
  "robot.query_navigation_status",
  "robot.capture_image",
  "robot.get_stream_url",
  "robot.query_speaker_status",
  "robot.query_gimbal_attitude",
  "robot.query_inspection_summary",
] as const;

function numberParam(intent: IntentPayload, key: string): number | undefined {
  const params = intent.parameters as Record<string, unknown> | undefined;
  const value = params?.[key];
  return typeof value === "number" ? value : undefined;
}

function robotRequestedDurationSeconds(intent: IntentPayload): number | undefined {
  if (intent.skill !== "robot.move") return undefined;
  const durationMs = numberParam(intent, "duration_ms");
  return durationMs === undefined ? undefined : durationMs / 1000;
}

function robotSafetyDecision(ctx: DomainPackSafetyContext): DomainPackSafetyDecision | null {
  if (ctx.skill === "robot.move") {
    const params = ctx.intent.parameters as
      | {
          duration_ms?: number;
          distance_m?: number;
        }
      | undefined;
    if (
      (params?.duration_ms === undefined || params.duration_ms <= 0) &&
      (params?.distance_m === undefined || params.distance_m <= 0)
    ) {
      return {
        allowed: false,
        requires_confirmation: false,
        reason: "机器人移动须说明时长或距离。",
      };
    }
    return {
      allowed: true,
      requires_confirmation: true,
      reason: "机器人将发生位移，需要二次确认。",
    };
  }

  if (ctx.skill === "robot.navigate_to_waypoint") {
    return {
      allowed: true,
      requires_confirmation: true,
      reason: "机器人将执行路径导航，需要二次确认。",
    };
  }

  if (ctx.skill === "robot.play_alarm") {
    return {
      allowed: true,
      requires_confirmation: true,
      reason: "机器人将播放现场报警声，需要二次确认。",
    };
  }

  if (
    ctx.skill === "robot.play_audio" ||
    ctx.skill === "robot.gimbal_move" ||
    ctx.skill === "robot.gimbal_angle" ||
    ctx.skill === "robot.gimbal_record_start" ||
    ctx.skill === "robot.gimbal_laser_range"
  ) {
    return {
      allowed: true,
      requires_confirmation: true,
      reason: "机器人将执行现场可感知动作，需要二次确认。",
    };
  }

  if (ctx.skill === "robot.set_light") {
    const params = ctx.intent.parameters as { light?: string } | undefined;
    const highVisibilityLight = params?.light === "strobe" || params?.light === "red_blue";
    return {
      allowed: true,
      requires_confirmation: highVisibilityLight,
      reason: highVisibilityLight ? "机器人将开启警示灯，需要二次确认。" : "允许控制机器人灯光。",
    };
  }

  return null;
}

export const ROBOT_SAFETY_POLICY: DomainPackSafetyPolicy = {
  confirmDurationThresholdSeconds: 600,
  authorization: {
    controlSkills: ROBOT_PHYSICAL_SKILLS,
    workerAllowedSkills: ROBOT_QUERY_SKILLS,
    readonlyAllowedSkills: ROBOT_QUERY_SKILLS,
    denialReasons: {
      worker: "工人账号无权执行该机器人操作。",
      readonly: "当前账号仅可查看，不能控制机器人。",
    },
  },
  requestedDurationSeconds: robotRequestedDurationSeconds,
  evaluateIntent: robotSafetyDecision,
  stopSkills: [
    "robot.stand_up",
    "robot.sit_down",
    "robot.cancel_navigation",
    "robot.speak",
    "robot.set_gait",
    "robot.set_motion_mode",
    "robot.set_volume",
    "robot.stop_audio",
    "robot.set_speaker_pitch",
    "robot.set_body_led",
    "robot.stop_alarm",
    "robot.gimbal_center",
    "robot.gimbal_stop",
    "robot.gimbal_lock",
    "robot.gimbal_follow",
    "robot.gimbal_zoom",
    "robot.gimbal_focus",
    "robot.gimbal_auto_focus",
    "robot.gimbal_record_stop",
    "robot.gimbal_capture",
    "robot.gimbal_thermal_palette",
  ],
  stopReason: "允许执行机器人指令。",
};
