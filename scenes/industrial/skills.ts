import { definePhysicalSkill } from "@embodied-agent/domain-sdk";
import type { DomainPackPhysicalSkillDefinition } from "@embodied-agent/core";

export const INDUSTRIAL_P0_SKILLS = ["industrial.query_status", "command.query_status"] as const;

export const INDUSTRIAL_P1_SKILLS = [
  "industrial.start_exhaust",
  "industrial.stop_exhaust",
] as const;

export const INDUSTRIAL_PHYSICAL_SKILL_DEFINITIONS = [
  definePhysicalSkill({
    skill: "industrial.start_exhaust",
    display: {
      title_zh: "启动排风",
      icon: "fan",
      summary_zh: "配电柜过温排风降温",
      control: { kind: "toggle" },
    },
  }),
  definePhysicalSkill({
    skill: "industrial.stop_exhaust",
    display: {
      title_zh: "停止排风",
      icon: "fan",
      summary_zh: "关闭排风风机",
      control: { kind: "toggle" },
    },
  }),
] as const;

export const INDUSTRIAL_PHYSICAL_SKILLS = INDUSTRIAL_PHYSICAL_SKILL_DEFINITIONS.map(
  (def) => def.skill,
);

export const INDUSTRIAL_PHYSICAL_DEFINITIONS: readonly DomainPackPhysicalSkillDefinition[] =
  INDUSTRIAL_PHYSICAL_SKILL_DEFINITIONS.map(({ skill, display }) => ({ skill, display }));
