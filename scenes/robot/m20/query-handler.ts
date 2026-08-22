import type { DomainPackSkillHandlerResult, IntentPayload } from "@embodied-agent/core";
import { createM20Client, type M20ClientConfig } from "./client.js";

const QUERY_SKILLS = new Set([
  "robot.query_status",
  "robot.query_pose",
  "robot.query_navigation_status",
  "robot.capture_image",
  "robot.get_stream_url",
  "robot.query_speaker_status",
  "robot.query_gimbal_attitude",
]);

function configFromUnknown(value: unknown): M20ClientConfig {
  if (!value || typeof value !== "object") return {};
  return value as M20ClientConfig;
}

export function canHandleRobotQuerySkill(intent: IntentPayload): boolean {
  return QUERY_SKILLS.has(intent.skill);
}

export async function handleRobotQuerySkill(
  intent: IntentPayload,
  context: {
    domainConfig?: unknown;
    deploymentId: string;
    userId?: string;
    services?: Record<string, unknown>;
  },
): Promise<DomainPackSkillHandlerResult> {
  const m20 = createM20Client(() => configFromUnknown(context.domainConfig));
  switch (intent.skill) {
    case "robot.query_status": {
      const [status, sensors, obstacle] = await Promise.all([
        m20.bodyStatus(),
        m20.sensors(),
        m20.obstacle(),
      ]);
      return {
        reply: "M20 状态已读取。",
        params: { status, sensors, obstacle },
      };
    }
    case "robot.query_pose": {
      const pose = await m20.pose();
      return {
        reply: "M20 当前位姿已读取。",
        params: { pose },
      };
    }
    case "robot.query_navigation_status": {
      const nav = await m20.navStatus();
      return {
        reply: "M20 导航状态已读取。",
        params: { navigation: nav },
      };
    }
    case "robot.capture_image": {
      const p = intent.parameters as { source?: "body" | "gimbal" } | undefined;
      const capture = await m20.capture(p?.source ?? "body");
      return {
        reply: "M20 图像已抓取。",
        params: { capture },
      };
    }
    case "robot.get_stream_url": {
      const p = intent.parameters as { source?: "body" | "gimbal" } | undefined;
      const stream = await m20.streamUrl(p?.source ?? "body");
      return {
        reply: "M20 视频流地址已读取。",
        params: { stream },
      };
    }
    case "robot.query_speaker_status": {
      const [status, device] = await Promise.all([m20.speakerStatus(), m20.speakerDeviceInfo()]);
      return {
        reply: "M20 喊话器状态已读取。",
        params: { status, device },
      };
    }
    case "robot.query_gimbal_attitude": {
      const attitude = await m20.gimbalAttitude();
      return {
        reply: "M20 吊舱姿态已读取。",
        params: { attitude },
      };
    }
    default:
      return { reply: "暂不支持该机器人查询技能。", params: {} };
  }
}
