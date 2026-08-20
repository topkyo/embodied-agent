import type { IntentPayload } from "@embodied-agent/core";

export function robotPhysicalCommandSentReply(skill: IntentPayload["skill"]): string | undefined {
  return skill.startsWith("robot.") ? "机器人指令已执行并记录。" : undefined;
}

export function robotPendingSummary(intent: IntentPayload): string | undefined {
  const params = intent.parameters as {
    direction?: string;
    duration_ms?: number;
    distance_m?: number;
    waypoint_id?: string;
    file_name?: string;
    light?: string;
  };
  if (intent.skill === "robot.move") {
    const direction = params.direction;
    const duration = params.duration_ms ? `${Math.round(params.duration_ms / 1000)} 秒` : undefined;
    const distance = params.distance_m ? `${params.distance_m} 米` : undefined;
    return `机器人${direction ? `向${direction}` : ""}移动 ${duration ?? distance ?? ""}`.trim();
  }
  if (intent.skill === "robot.navigate_to_waypoint") {
    return `机器人导航到 ${params.waypoint_id}`;
  }
  if (intent.skill === "robot.play_alarm") {
    return "机器人播放现场报警声";
  }
  if (intent.skill === "robot.play_audio") {
    return `机器人播放音频 ${params.file_name}`;
  }
  if (intent.skill === "robot.set_light") {
    return `机器人控制 ${params.light} 灯`;
  }
  if (intent.skill.startsWith("robot.gimbal_")) {
    return "机器人控制吊舱";
  }
  return undefined;
}

export function robotCommandStatusMessage(record: unknown): string | null {
  const row = record as {
    status?: string;
    command?: { action?: string; device_id?: string };
    error?: { message?: string };
  };
  const device = row.command?.device_id ?? "机器人";
  switch (row.status) {
    case "completed":
      return `${device} 机器人指令已完成。`;
    case "rejected":
    case "failed":
      return `${device} 机器人指令未执行：${row.error?.message ?? row.status}。`;
    case "timeout":
      return `${device} 机器人指令超时：设备在约定时间内未确认。`;
    default:
      return null;
  }
}
