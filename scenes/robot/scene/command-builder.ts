import type {
  DomainPackCommandPatch,
  IntentPayload,
  SceneResolvedDeviceTarget,
} from "@embodied-agent/core";

const ROBOT_ACTION_BY_SKILL: Record<string, DomainPackCommandPatch["action"]> = {
  "robot.stand_up": "stand_up",
  "robot.sit_down": "sit_down",
  "robot.move": "move",
  "robot.set_gait": "set_gait",
  "robot.set_motion_mode": "set_motion_mode",
  "robot.navigate_to_waypoint": "navigate_to_waypoint",
  "robot.cancel_navigation": "cancel_navigation",
  "robot.speak": "speak",
  "robot.set_volume": "set_volume",
  "robot.play_audio": "play_audio",
  "robot.stop_audio": "stop_audio",
  "robot.set_speaker_pitch": "set_speaker_pitch",
  "robot.set_light": "set_light",
  "robot.set_body_led": "set_body_led",
  "robot.play_alarm": "play_alarm",
  "robot.stop_alarm": "stop_alarm",
  "robot.gimbal_move": "gimbal_move",
  "robot.gimbal_angle": "gimbal_angle",
  "robot.gimbal_center": "gimbal_center",
  "robot.gimbal_stop": "gimbal_stop",
  "robot.gimbal_lock": "gimbal_lock",
  "robot.gimbal_follow": "gimbal_follow",
  "robot.gimbal_zoom": "gimbal_zoom",
  "robot.gimbal_focus": "gimbal_focus",
  "robot.gimbal_auto_focus": "gimbal_auto_focus",
  "robot.gimbal_record_start": "gimbal_record_start",
  "robot.gimbal_record_stop": "gimbal_record_stop",
  "robot.gimbal_capture": "gimbal_capture",
  "robot.gimbal_thermal_palette": "gimbal_thermal_palette",
  "robot.gimbal_laser_range": "gimbal_laser_range",
};

export function buildRobotCommandPatch(
  intent: IntentPayload,
  _target: SceneResolvedDeviceTarget,
): DomainPackCommandPatch | null {
  const action = ROBOT_ACTION_BY_SKILL[intent.skill];
  if (!action) return null;
  return {
    action,
    parameters: (intent.parameters ?? {}) as Record<string, unknown>,
  };
}
