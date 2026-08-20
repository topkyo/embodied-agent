import type { DomainPackSkillHandlerResult, IntentPayload } from "@embodied-agent/core";

const PHYSICAL_REPLY_SKILLS = new Set([
  "greenhouse.open_vent",
  "greenhouse.close_vent",
  "greenhouse.stop_vent",
  "greenhouse.set_mode",
  "fan.start",
  "fan.stop",
]);

export function canHandleGreenhousePhysicalReplySkill(intent: IntentPayload): boolean {
  return PHYSICAL_REPLY_SKILLS.has(intent.skill);
}

export async function handleGreenhousePhysicalReplySkill(
  intent: IntentPayload,
): Promise<DomainPackSkillHandlerResult> {
  const target = intent.target as { greenhouse_id?: string; fan_id?: string };
  const p = intent.parameters as {
    duration_seconds?: number;
    mode?: string;
    temp_high_c?: number;
    max_temp_c?: number;
    temp_low_c?: number;
    until_iso?: string;
  };
  if (intent.skill === "greenhouse.open_vent") {
    return {
      reply: `已开始为 ${target.greenhouse_id} 通风 ${p.duration_seconds} 秒。`,
      params: {
        entity_id: target.greenhouse_id,
        duration_seconds: p.duration_seconds,
      },
    };
  }

  if (intent.skill === "greenhouse.close_vent") {
    return {
      reply: `已开始关闭 ${target.greenhouse_id} 通风 ${p.duration_seconds} 秒。`,
      params: {
        entity_id: target.greenhouse_id,
        duration_seconds: p.duration_seconds,
      },
    };
  }

  if (intent.skill === "greenhouse.stop_vent") {
    return {
      reply: `已停止 ${target.greenhouse_id} 通风。`,
      params: { entity_id: target.greenhouse_id },
    };
  }

  if (intent.skill === "greenhouse.set_mode") {
    const id = target.greenhouse_id;
    if (p.mode === "off") {
      return {
        reply: `已关闭 ${id} 的夜间自动通风模式。`,
        params: { entity_id: id, mode: "off" },
      };
    }
    const high = p.temp_high_c ?? p.max_temp_c ?? 30;
    const low = p.temp_low_c ?? high - 2;
    const until = p.until_iso ? `，持续到 ${p.until_iso}` : "";
    return {
      reply: `已启用 ${id} 夜间通风：温度 ≥${high}°C 自动开帘、≤${low}°C 自动关帘${until}（边缘网关本地执行）。`,
      params: {
        entity_id: id,
        mode: p.mode,
        temp_high_c: high,
        temp_low_c: low,
        until_iso: p.until_iso,
      },
    };
  }

  if (intent.skill === "fan.start") {
    return {
      reply: `已启动风机 ${target.fan_id}。`,
      params: {
        fan_id: target.fan_id,
        duration_seconds: p.duration_seconds,
      },
    };
  }

  if (intent.skill === "fan.stop") {
    return {
      reply: `已停止风机 ${target.fan_id}。`,
      params: { fan_id: target.fan_id },
    };
  }

  return { reply: "暂不支持该农业物理控制技能。", params: {} };
}
