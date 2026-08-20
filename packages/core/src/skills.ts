// 平台技能枚举有意为空：技能真源在各 active Domain Pack 的 skills.ts / manifest（见 AGENTS.md）。
// 因此 SkillName 退化为任意 string，isP0Skill/isP1Skill/isP2Skill 对所有输入返回 false。
// 该退化是已知且有意的：具体技能名的约束由 Domain Pack conformance（domain-sdk）兜住，
// 平台层只做透传，不在编译期收窄技能字面量。
export const PLATFORM_P0_SKILLS = [] as const;
export type PlatformP0Skill = (typeof PLATFORM_P0_SKILLS)[number];

export const P0_SKILLS = PLATFORM_P0_SKILLS;
export type P0Skill = (typeof P0_SKILLS)[number];
export const P0_SKILL_SET: ReadonlySet<string> = new Set(P0_SKILLS);
export function isP0Skill(skill: string): skill is P0Skill {
  return P0_SKILL_SET.has(skill);
}

export const P1_SKILLS = [] as const;
export type P1Skill = (typeof P1_SKILLS)[number];
export const P1_SKILL_SET: ReadonlySet<string> = new Set(P1_SKILLS);
export function isP1Skill(skill: string): skill is P1Skill {
  return P1_SKILL_SET.has(skill);
}

export const PLATFORM_P2_SKILLS = [] as const;
export const P2_SKILLS = PLATFORM_P2_SKILLS;
export type P2Skill = (typeof P2_SKILLS)[number];
export const P2_SKILL_SET: ReadonlySet<string> = new Set(P2_SKILLS);
export function isP2Skill(skill: string): skill is P2Skill {
  return P2_SKILL_SET.has(skill);
}

export const ALL_SKILLS = [...P0_SKILLS, ...P1_SKILLS, ...P2_SKILLS] as const;

export type SkillName = (typeof ALL_SKILLS)[number] | (string & {});
