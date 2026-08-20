import type {
  DomainPackSafetyContext,
  DomainPackSafetyDecision,
  DomainPackSafetyDeviceState,
  DomainPackSafetyPolicy,
  DomainPackUserRole,
  IntentPayload,
  SkillName,
} from "@embodied-agent/core";
import { formatDurationZh } from "./duration.js";

export type UserRole = DomainPackUserRole;

export type DeviceRuntimeState = DomainPackSafetyDeviceState;

export type SafetyContext = {
  user_id: string;
  role: UserRole;
  skill: SkillName;
  intent: IntentPayload;
  device?: DeviceRuntimeState;
  /** Above this requires confirmation (不截断用户时长) */
  confirm_duration_threshold_seconds?: number;
  domainSafetyPolicy: DomainPackSafetyPolicy;
};

export type SafetyRejectCode =
  "interlock_direction_conflict" | "role_denied" | "device_unavailable" | string;

export type SafetyDecision = {
  allowed: boolean;
  requires_confirmation: boolean;
  reason: string;
  reject_code?: SafetyRejectCode;
  guidance?: string;
};

function policySet(values: readonly string[] | undefined): ReadonlySet<string> {
  return new Set(values ?? []);
}

function isControlSkill(skill: SkillName, policy: DomainPackSafetyPolicy): boolean {
  return policySet(policy.authorization.controlSkills).has(skill);
}

function denialDecision(reason: string): SafetyDecision {
  return {
    allowed: false,
    requires_confirmation: false,
    reject_code: "role_denied",
    reason,
  };
}

function authorizeRole(
  ctx: SafetyContext,
  policy: DomainPackSafetyPolicy,
  strictReadonly: boolean,
): SafetyDecision | null {
  const { role, skill } = ctx;
  const authorization = policy.authorization;
  if (role === "owner" || role === "operator") return null;

  if (role === "viewer" || role === "readonly") {
    const readonlyAllowed = policySet(authorization.readonlyAllowedSkills);
    if (
      (strictReadonly && !readonlyAllowed.has(skill)) ||
      (!strictReadonly && isControlSkill(skill, policy))
    ) {
      return denialDecision(
        authorization.denialReasons?.readonly ?? "当前账号仅可查看，不能控制设备。",
      );
    }
  }

  if (role === "worker" && !policySet(authorization.workerAllowedSkills).has(skill)) {
    return denialDecision(authorization.denialReasons?.worker ?? "工人账号无权执行该操作。");
  }

  if (policySet(authorization.privilegedSkills).has(skill)) {
    return denialDecision(
      authorization.denialReasons?.skill?.[skill] ??
        authorization.denialReasons?.privileged ??
        "仅管理员可执行该操作。",
    );
  }

  return null;
}

function toDomainSafetyContext(
  ctx: SafetyContext,
  confirmThreshold: number,
): DomainPackSafetyContext {
  return {
    user_id: ctx.user_id,
    role: ctx.role,
    skill: ctx.skill,
    intent: ctx.intent,
    device: ctx.device,
    confirm_duration_threshold_seconds: confirmThreshold,
  };
}

function toSafetyDecision(decision: DomainPackSafetyDecision): SafetyDecision {
  return {
    ...decision,
    reject_code: decision.reject_code,
  };
}

/** Running-action interlock: cannot request opposite direction while an action is active. */
export function runningActionInterlockConflict(
  running: "open" | "close" | "start" | null | undefined,
  requested: "open" | "close",
): boolean {
  if (!running || running === "start") return false;
  return running !== requested;
}
function resolveConfirmThresholdSeconds(
  ctx: SafetyContext,
  policy: DomainPackSafetyPolicy,
): number {
  if (ctx.confirm_duration_threshold_seconds !== undefined) {
    return ctx.confirm_duration_threshold_seconds;
  }
  return policy.confirmDurationThresholdSeconds;
}

export function evaluateCommand(ctx: SafetyContext): SafetyDecision {
  const { skill, intent, device } = ctx;
  const policy = ctx.domainSafetyPolicy;
  if (!policy) {
    throw new Error("evaluateCommand requires active Domain Pack safety policy.");
  }
  const confirmThreshold = resolveConfirmThresholdSeconds(ctx, policy);

  const roleDecision = authorizeRole(ctx, policy, true);
  if (roleDecision) return roleDecision;

  if (isControlSkill(skill, policy)) {
    if (!device) {
      return {
        allowed: false,
        requires_confirmation: false,
        reason: "目标设备未注册或不可用。",
      };
    }
    if (device.status === "offline") {
      return {
        allowed: false,
        requires_confirmation: false,
        reason: "设备离线，无法执行控制。",
      };
    }
    if (device.status === "maintenance" || device.status === "disabled") {
      return {
        allowed: false,
        requires_confirmation: false,
        reason: "设备维护中或已禁用。",
      };
    }
    if (device.manual_override) {
      return {
        allowed: false,
        requires_confirmation: false,
        reason: "现场手动优先已生效，请先解除手动模式。",
      };
    }
  }

  const domainDecision = policy.evaluateIntent?.(toDomainSafetyContext(ctx, confirmThreshold));
  if (domainDecision) return toSafetyDecision(domainDecision);

  // 方向互锁与是否携带时长无关：无 duration 的开/关指令同样不得绕过互锁。
  const interlockAction = policy.interlockAction?.(intent);
  if (
    interlockAction &&
    device?.running_action &&
    runningActionInterlockConflict(device.running_action, interlockAction)
  ) {
    return {
      allowed: false,
      requires_confirmation: false,
      reject_code: "interlock_direction_conflict",
      reason: policy.interlockConflictReason ?? "设备正在相反方向运行，请先停止。",
      guidance: policy.interlockConflictGuidance,
    };
  }

  const duration = policy.requestedDurationSeconds?.(intent);

  if (duration !== undefined) {
    const requires_confirmation = duration >= confirmThreshold;
    return {
      allowed: true,
      requires_confirmation,
      reason: requires_confirmation
        ? `运行时长 ${formatDurationZh(duration)}，需要二次确认。`
        : "允许执行。",
    };
  }

  if (policySet(policy.stopSkills).has(skill)) {
    return {
      allowed: true,
      requires_confirmation: false,
      reason: policy.stopReason ?? "允许执行停止操作。",
    };
  }

  return {
    allowed: true,
    requires_confirmation: false,
    reason: "允许执行。",
  };
}
