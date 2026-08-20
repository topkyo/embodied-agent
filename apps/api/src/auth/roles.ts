import type { SkillName } from "@embodied-agent/core";
import type { UserRole } from "@embodied-agent/safety";
import { activeDomainAuthorizationPolicy } from "@embodied-agent/runtime";
import { getPlatformRuntimeContext } from "../runtime/context.js";

export const ROLES = ["owner", "operator", "worker", "readonly", "viewer"] as const;

export type AppRole = Extract<UserRole, (typeof ROLES)[number]>;

export const WORKER_ALLOWED_SKILLS = {
  has(skill: SkillName): boolean {
    return activeDomainAuthorizationPolicy(
      getPlatformRuntimeContext(),
    ).workerAllowedSkills.includes(skill);
  },
};

function includesSkill(values: readonly string[] | undefined, skill: SkillName): boolean {
  return values?.includes(skill) ?? false;
}

export function canRoleExecuteSkill(role: UserRole, skill: SkillName): boolean {
  const policy = activeDomainAuthorizationPolicy(getPlatformRuntimeContext());
  if (role === "owner" || role === "operator") return true;
  if (role === "viewer" || role === "readonly") {
    return includesSkill(policy.readonlyAllowedSkills, skill);
  }
  if (role === "worker") return includesSkill(policy.workerAllowedSkills, skill);
  return false;
}

export function roleDenialReason(role: UserRole, skill: SkillName): string {
  const policy = activeDomainAuthorizationPolicy(getPlatformRuntimeContext());
  if (role === "worker" && !WORKER_ALLOWED_SKILLS.has(skill)) {
    return policy.denialReasons?.worker ?? "工人账号无权执行该操作。";
  }
  if ((role === "readonly" || role === "viewer") && !canRoleExecuteSkill(role, skill)) {
    return policy.denialReasons?.readonly ?? "当前账号仅可查看，不能控制设备。";
  }
  if (role !== "owner" && role !== "operator") {
    return (
      policy.denialReasons?.skill?.[skill] ?? policy.denialReasons?.privileged ?? "无权执行该操作。"
    );
  }
  return "无权执行该操作。";
}
