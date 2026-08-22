/**
 * Robotics 控制动作 fallback 列表。
 * 当 ops schema 未声明 control.actions（或为空）时使用；
 * 有 schema 时仅用此表补全 demo parameters / 图标 / i18n label / 分组。
 */
export type RobotControlActionIcon =
  "bot" | "camera" | "gamepad" | "lightbulb" | "megaphone" | "navigation" | "rotate" | "volume";

/** 控制面板功能域分组（UI 排序真源）。 */
export type RobotControlGroupId =
  "emergency" | "motion" | "task" | "light_audio" | "gimbal" | "diagnostic";

export const ROBOT_CONTROL_GROUP_ORDER: readonly RobotControlGroupId[] = [
  "emergency",
  "motion",
  "task",
  "light_audio",
  "gimbal",
  "diagnostic",
] as const;

export const ROBOT_CONTROL_GROUP_LABEL_KEY: Record<RobotControlGroupId, string> = {
  emergency: "sceneOps.robot.group.emergency",
  motion: "sceneOps.robot.group.motion",
  task: "sceneOps.robot.group.task",
  light_audio: "sceneOps.robot.group.lightAudio",
  gimbal: "sceneOps.robot.group.gimbal",
  diagnostic: "sceneOps.robot.group.diagnostic",
};

export type RobotControlFallbackAction = {
  /** Full i18n key, e.g. sceneOps.robot.action.queryStatus */
  labelKey: string;
  skill: string;
  icon: RobotControlActionIcon;
  group: RobotControlGroupId;
  parameters?: Record<string, unknown>;
  confirm?: boolean;
};

export const ROBOT_CONTROL_FALLBACK_ACTIONS: readonly RobotControlFallbackAction[] = [
  {
    labelKey: "sceneOps.robot.action.cancelNavigation",
    skill: "robot.cancel_navigation",
    icon: "navigation",
    group: "emergency",
  },
  {
    labelKey: "sceneOps.robot.action.moveForward",
    skill: "robot.move",
    icon: "gamepad",
    group: "motion",
    parameters: { x: 0.3, duration_ms: 1000 },
    confirm: true,
  },
  {
    labelKey: "sceneOps.robot.action.standUp",
    skill: "robot.stand_up",
    icon: "gamepad",
    group: "motion",
  },
  {
    labelKey: "sceneOps.robot.action.sitDown",
    skill: "robot.sit_down",
    icon: "gamepad",
    group: "motion",
  },
  {
    labelKey: "sceneOps.robot.action.captureImage",
    skill: "robot.capture_image",
    icon: "camera",
    group: "task",
    parameters: { source: "body" },
  },
  {
    labelKey: "sceneOps.robot.action.videoStream",
    skill: "robot.get_stream_url",
    icon: "camera",
    group: "task",
    parameters: { source: "body" },
  },
  {
    labelKey: "sceneOps.robot.action.workLightOn",
    skill: "robot.set_light",
    icon: "lightbulb",
    group: "light_audio",
    parameters: { light: "work", state: "on" },
  },
  {
    labelKey: "sceneOps.robot.action.strobeOn",
    skill: "robot.set_light",
    icon: "lightbulb",
    group: "light_audio",
    parameters: { light: "strobe", state: "on" },
    confirm: true,
  },
  {
    labelKey: "sceneOps.robot.action.playAlarm",
    skill: "robot.play_alarm",
    icon: "megaphone",
    group: "light_audio",
    confirm: true,
  },
  {
    labelKey: "sceneOps.robot.action.stopAlarm",
    skill: "robot.stop_alarm",
    icon: "megaphone",
    group: "light_audio",
  },
  {
    labelKey: "sceneOps.robot.action.gimbalCenter",
    skill: "robot.gimbal_center",
    icon: "rotate",
    group: "gimbal",
  },
  {
    labelKey: "sceneOps.robot.action.gimbalStop",
    skill: "robot.gimbal_stop",
    icon: "rotate",
    group: "gimbal",
  },
  {
    labelKey: "sceneOps.robot.action.gimbalLeft",
    skill: "robot.gimbal_move",
    icon: "rotate",
    group: "gimbal",
    parameters: { direction: "left", duration_ms: 1000 },
    confirm: true,
  },
  {
    labelKey: "sceneOps.robot.action.gimbalZoomIn",
    skill: "robot.gimbal_zoom",
    icon: "camera",
    group: "gimbal",
    parameters: { action: "in" },
  },
  {
    labelKey: "sceneOps.robot.action.gimbalFocusFar",
    skill: "robot.gimbal_focus",
    icon: "camera",
    group: "gimbal",
    parameters: { action: "far" },
  },
  {
    labelKey: "sceneOps.robot.action.gimbalLaserRange",
    skill: "robot.gimbal_laser_range",
    icon: "camera",
    group: "gimbal",
    confirm: true,
  },
  {
    labelKey: "sceneOps.robot.action.queryStatus",
    skill: "robot.query_status",
    icon: "bot",
    group: "diagnostic",
  },
  {
    labelKey: "sceneOps.robot.action.queryPose",
    skill: "robot.query_pose",
    icon: "navigation",
    group: "diagnostic",
  },
  {
    labelKey: "sceneOps.robot.action.queryNavigationStatus",
    skill: "robot.query_navigation_status",
    icon: "navigation",
    group: "diagnostic",
  },
] as const;

/** skill → 首个匹配的 fallback 元数据（用于 schema 动作补全）。 */
export const ROBOT_CONTROL_FALLBACK_BY_SKILL: ReadonlyMap<string, RobotControlFallbackAction> =
  (() => {
    const map = new Map<string, RobotControlFallbackAction>();
    for (const action of ROBOT_CONTROL_FALLBACK_ACTIONS) {
      if (!map.has(action.skill)) map.set(action.skill, action);
    }
    return map;
  })();

export function iconForRobotSkill(skill: string): RobotControlActionIcon {
  const fromFallback = ROBOT_CONTROL_FALLBACK_BY_SKILL.get(skill)?.icon;
  if (fromFallback) return fromFallback;
  if (skill.includes("gimbal") || skill.includes("capture") || skill.includes("stream")) {
    return "camera";
  }
  if (skill.includes("light") || skill.includes("led")) return "lightbulb";
  if (skill.includes("speak") || skill.includes("alarm") || skill.includes("audio")) {
    return "megaphone";
  }
  if (skill.includes("nav") || skill.includes("pose") || skill.includes("waypoint")) {
    return "navigation";
  }
  if (skill.includes("volume")) return "volume";
  if (
    skill.includes("move") ||
    skill.includes("stand") ||
    skill.includes("sit") ||
    skill.includes("gait")
  ) {
    return "gamepad";
  }
  return "bot";
}

/** schema 未知 skill 时按名称推断功能域分组。 */
export function groupForRobotSkill(skill: string): RobotControlGroupId {
  const fromFallback = ROBOT_CONTROL_FALLBACK_BY_SKILL.get(skill)?.group;
  if (fromFallback) return fromFallback;
  if (
    skill.includes("cancel") ||
    skill.includes("estop") ||
    skill.includes("emergency") ||
    skill.includes("stop_nav")
  ) {
    return "emergency";
  }
  if (skill.includes("gimbal")) return "gimbal";
  if (
    skill.includes("light") ||
    skill.includes("alarm") ||
    skill.includes("speak") ||
    skill.includes("volume") ||
    skill.includes("audio")
  ) {
    return "light_audio";
  }
  if (
    skill.includes("query") ||
    skill.includes("status") ||
    skill.includes("pose") ||
    skill.includes("diag")
  ) {
    return "diagnostic";
  }
  if (
    skill.includes("move") ||
    skill.includes("stand") ||
    skill.includes("sit") ||
    skill.includes("gait")
  ) {
    return "motion";
  }
  return "task";
}
