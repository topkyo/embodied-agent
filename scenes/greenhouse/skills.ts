import { definePhysicalSkill } from "@embodied-agent/domain-sdk";
import type { DomainPackPhysicalSkillDefinition } from "@embodied-agent/core";

/** Greenhouse Domain Pack P0 skills (ventilation, fan, greenhouse control). */
export const GREENHOUSE_P0_SKILLS = [
  "greenhouse.query_status",
  "greenhouse.query_all_status",
  "greenhouse.open_vent",
  "greenhouse.close_vent",
  "greenhouse.stop_vent",
  "greenhouse.set_mode",
  "fan.start",
  "fan.stop",
  "alert.set_threshold",
  "alert.query_threshold",
  "alert.clear_threshold",
  "alert.query_today",
  "log.query_today",
  "report.set_schedule",
  "report.cancel_schedule",
  "report.query_schedule",
  "command.query_status",
  "weather.query_forecast",
  "weather.query_alert",
  "satellite.query_ndvi",
  "agronomy.query_pest",
  "tasks.query_task",
  "tasks.create_task",
  "advice.query_weekly",
  "policy.apply_suggestion",
] as const;

export type GreenhouseP0Skill = (typeof GREENHOUSE_P0_SKILLS)[number];

/** Greenhouse Domain Pack P1 skills (irrigation). */
export const GREENHOUSE_P1_SKILLS = [
  "irrigation.start",
  "irrigation.stop",
  "irrigation.query_status",
] as const;

export type GreenhouseP1Skill = (typeof GREENHOUSE_P1_SKILLS)[number];

export const GREENHOUSE_P0_SKILL_SET: ReadonlySet<string> = new Set(GREENHOUSE_P0_SKILLS);

export const GREENHOUSE_P1_SKILL_SET: ReadonlySet<string> = new Set(GREENHOUSE_P1_SKILLS);

/** 物理控制技能 ops display 真源（路由与安全层仍用 skill id 数组）。 */
export const GREENHOUSE_PHYSICAL_SKILL_DEFINITIONS = [
  definePhysicalSkill({
    skill: "greenhouse.open_vent",
    display: {
      title_zh: "开天窗",
      icon: "wind",
      summary_zh: "调节顶部通风",
      control: { kind: "slider", unit: "%", demo_value: 40 },
    },
  }),
  definePhysicalSkill({
    skill: "greenhouse.close_vent",
    display: {
      title_zh: "关天窗",
      icon: "wind",
      summary_zh: "关闭顶部通风",
      control: { kind: "slider", unit: "%", demo_value: 40 },
    },
  }),
  definePhysicalSkill({
    skill: "greenhouse.stop_vent",
    display: { title_zh: "停天窗", icon: "wind", summary_zh: "停止通风动作" },
  }),
  definePhysicalSkill({
    skill: "greenhouse.set_mode",
    display: { title_zh: "设环控模式", icon: "gauge", summary_zh: "切换夜间通风等模式" },
  }),
  definePhysicalSkill({
    skill: "fan.start",
    display: {
      title_zh: "开风机",
      icon: "fan",
      summary_zh: "启动棚内循环风机",
      control: { kind: "toggle" },
    },
  }),
  definePhysicalSkill({
    skill: "fan.stop",
    display: {
      title_zh: "关风机",
      icon: "fan",
      summary_zh: "停止棚内循环风机",
      control: { kind: "toggle" },
    },
  }),
  definePhysicalSkill({
    skill: "irrigation.start",
    display: {
      title_zh: "开始灌溉",
      icon: "droplets",
      summary_zh: "启动分区灌溉阀门",
      control: { kind: "toggle" },
    },
  }),
  definePhysicalSkill({
    skill: "irrigation.stop",
    display: {
      title_zh: "停止灌溉",
      icon: "droplets",
      summary_zh: "关闭灌溉阀门",
      control: { kind: "toggle" },
    },
  }),
] as const;

export const GREENHOUSE_PHYSICAL_SKILLS = GREENHOUSE_PHYSICAL_SKILL_DEFINITIONS.map(
  (def) => def.skill,
);

export const GREENHOUSE_PHYSICAL_DEFINITIONS: readonly DomainPackPhysicalSkillDefinition[] =
  GREENHOUSE_PHYSICAL_SKILL_DEFINITIONS.map(({ skill, display }) => ({ skill, display }));
