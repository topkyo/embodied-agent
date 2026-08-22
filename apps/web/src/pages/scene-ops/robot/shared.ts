import type { CommandRow } from "../../../api";

export const ROBOTICS_PACK_ID = "robotics" as const;

/** 需用户输入参数的 skill：不进快捷按钮栏，由控制面板表单处理。 */
export const ROBOT_CUSTOM_INPUT_SKILLS = new Set([
  "robot.speak",
  "robot.set_volume",
  "robot.navigate_to_waypoint",
]);

export function jsonPreview(value: unknown): string {
  if (value === undefined || value === null) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function makeIntent(skill: string, parameters?: Record<string, unknown>, robotId?: string) {
  return {
    skill,
    target: robotId ? { robot_id: robotId } : {},
    ...(parameters ? { parameters } : {}),
  };
}

export function isRobotCommand(row: CommandRow): boolean {
  return (
    row.command.action.startsWith("robot.") ||
    row.command.device_type === "robot_dog" ||
    row.scene_skill_id?.startsWith("robot") === true
  );
}
