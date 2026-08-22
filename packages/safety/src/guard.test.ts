import { describe, expect, it } from "vitest";
import { evaluateCommand, runningActionInterlockConflict, type SafetyContext } from "./guard.js";
import type { DomainPackSafetyPolicy, IntentPayload } from "@embodied-agent/core";

const openVentIntent: IntentPayload = {
  skill: "greenhouse.open_vent",
  target: { greenhouse_id: "gh-001" },
  parameters: { duration_seconds: 600 },
};

const activeDevice = {
  device_id: "vent-gh-001-left",
  status: "active" as const,
  manual_override: false,
  running_action: null,
};

const activeRobotDevice = {
  device_id: "m20-001",
  status: "active" as const,
  manual_override: false,
  running_action: null,
};

function numberParam(intent: IntentPayload, key: string): number | undefined {
  const params = intent.parameters as Record<string, unknown> | undefined;
  const value = params?.[key];
  return typeof value === "number" ? value : undefined;
}

const greenhouseSafetyPolicy: DomainPackSafetyPolicy = {
  confirmDurationThresholdSeconds: 600,
  authorization: {
    controlSkills: [
      "greenhouse.open_vent",
      "greenhouse.close_vent",
      "greenhouse.stop_vent",
      "fan.start",
      "fan.stop",
      "irrigation.start",
      "irrigation.stop",
    ],
    workerAllowedSkills: ["alert.query_today", "command.query_status", "fan.start", "fan.stop"],
    readonlyAllowedSkills: ["alert.query_today", "command.query_status"],
    denialReasons: {
      worker: "工人账号无权执行该操作。",
      readonly: "当前账号仅可查看，不能控制设备。",
    },
  },
  requestedDurationSeconds(intent) {
    if (
      intent.skill === "greenhouse.open_vent" ||
      intent.skill === "greenhouse.close_vent" ||
      intent.skill === "fan.start" ||
      intent.skill === "irrigation.start"
    ) {
      return numberParam(intent, "duration_seconds");
    }
    return undefined;
  },
  interlockAction(intent) {
    if (intent.skill === "greenhouse.open_vent") return "open";
    if (intent.skill === "greenhouse.close_vent") return "close";
    return undefined;
  },
  evaluateIntent(ctx) {
    if (
      ctx.skill === "fan.start" &&
      (numberParam(ctx.intent, "duration_seconds") === undefined ||
        numberParam(ctx.intent, "duration_seconds")! <= 0)
    ) {
      return {
        allowed: false,
        requires_confirmation: false,
        reason: "风机启动须说明运行时长，例如「开 10 分钟」。",
      };
    }
    return null;
  },
  stopSkills: ["greenhouse.stop_vent", "fan.stop"],
  stopReason: "允许执行停止操作。",
};

const robotSafetyPolicy: DomainPackSafetyPolicy = {
  confirmDurationThresholdSeconds: 600,
  authorization: {
    controlSkills: [
      "robot.move",
      "robot.navigate_to_waypoint",
      "robot.gimbal_move",
      "robot.play_audio",
    ],
    workerAllowedSkills: ["robot.query_status"],
    readonlyAllowedSkills: ["robot.query_status"],
    denialReasons: {
      worker: "工人账号无权执行该操作。",
      readonly: "当前账号仅可查看，不能控制机器人。",
    },
  },
  requestedDurationSeconds(intent) {
    if (intent.skill !== "robot.move") return undefined;
    const durationMs = numberParam(intent, "duration_ms");
    return durationMs === undefined ? undefined : durationMs / 1000;
  },
  evaluateIntent(ctx) {
    if (ctx.skill === "robot.move") {
      const params = ctx.intent.parameters as
        { duration_ms?: number; distance_m?: number } | undefined;
      if (
        (params?.duration_ms === undefined || params.duration_ms <= 0) &&
        (params?.distance_m === undefined || params.distance_m <= 0)
      ) {
        return {
          allowed: false,
          requires_confirmation: false,
          reason: "机器人移动须说明时长或距离。",
        };
      }
      return {
        allowed: true,
        requires_confirmation: true,
        reason: "机器人将发生位移，需要二次确认。",
      };
    }
    if (ctx.skill === "robot.navigate_to_waypoint") {
      return {
        allowed: true,
        requires_confirmation: true,
        reason: "机器人将执行路径导航，需要二次确认。",
      };
    }
    if (ctx.skill === "robot.gimbal_move" || ctx.skill === "robot.play_audio") {
      return {
        allowed: true,
        requires_confirmation: true,
        reason: "机器人将执行现场可感知动作，需要二次确认。",
      };
    }
    return null;
  },
};

function evaluateWithPolicy(
  ctx: Omit<SafetyContext, "domainSafetyPolicy">,
  domainSafetyPolicy: DomainPackSafetyPolicy,
) {
  return evaluateCommand({ ...ctx, domainSafetyPolicy });
}

function evaluateGreenhouse(ctx: Omit<SafetyContext, "domainSafetyPolicy">) {
  return evaluateWithPolicy(ctx, greenhouseSafetyPolicy);
}

function evaluateRobot(ctx: Omit<SafetyContext, "domainSafetyPolicy">) {
  return evaluateWithPolicy(ctx, robotSafetyPolicy);
}

describe("runningActionInterlockConflict", () => {
  it("blocks open while close is running", () => {
    expect(runningActionInterlockConflict("close", "open")).toBe(true);
  });

  it("does not block same-direction open/open", () => {
    expect(runningActionInterlockConflict("open", "open")).toBe(false);
  });

  it("does not block same-direction close/close", () => {
    expect(runningActionInterlockConflict("close", "close")).toBe(false);
  });
});

describe("evaluateCommand", () => {
  it("throws when domain safety policy is missing", () => {
    expect(() =>
      evaluateCommand({
        user_id: "owner-001",
        role: "owner",
        skill: "greenhouse.open_vent",
        intent: openVentIntent,
        device: activeDevice,
        domainSafetyPolicy: undefined as never,
      }),
    ).toThrow(/safety policy/);
  });

  it("allows owner for normal open_vent", () => {
    const d = evaluateGreenhouse({
      user_id: "owner-001",
      role: "owner",
      skill: "greenhouse.open_vent",
      intent: openVentIntent,
      device: activeDevice,
    });
    expect(d.allowed).toBe(true);
  });

  it("allows duration beyond former 15-minute device cap", () => {
    const d = evaluateGreenhouse({
      user_id: "owner-001",
      role: "owner",
      skill: "greenhouse.open_vent",
      intent: {
        ...openVentIntent,
        parameters: { duration_seconds: 3600 },
      },
      device: activeDevice,
    });
    expect(d.allowed).toBe(true);
    expect(d.requires_confirmation).toBe(true);
    expect(d.reason).toContain("60 分钟");
  });

  it("allows irrigation beyond former registry cap", () => {
    const d = evaluateGreenhouse({
      user_id: "owner-001",
      role: "owner",
      skill: "irrigation.start",
      intent: {
        skill: "irrigation.start",
        target: { zone_id: "zone-b", greenhouse_id: "gh-002" },
        parameters: { duration_seconds: 7200 },
      },
      device: activeDevice,
    });
    expect(d.allowed).toBe(true);
    expect(d.requires_confirmation).toBe(true);
  });

  it("rejects worker open_vent", () => {
    const d = evaluateGreenhouse({
      user_id: "worker-001",
      role: "worker",
      skill: "greenhouse.open_vent",
      intent: openVentIntent,
      device: activeDevice,
    });
    expect(d.allowed).toBe(false);
  });

  it("allows worker to query alert and command status", () => {
    const alertIntent: IntentPayload = {
      skill: "alert.query_today",
      target: {},
    };
    expect(
      evaluateGreenhouse({
        user_id: "worker-001",
        role: "worker",
        skill: "alert.query_today",
        intent: alertIntent,
      }).allowed,
    ).toBe(true);

    const commandIntent: IntentPayload = {
      skill: "command.query_status",
      target: {},
      parameters: { recent: true },
    };
    expect(
      evaluateGreenhouse({
        user_id: "worker-001",
        role: "worker",
        skill: "command.query_status",
        intent: commandIntent,
      }).allowed,
    ).toBe(true);
  });

  it("allows worker to query robot status but rejects robot control", () => {
    expect(
      evaluateRobot({
        user_id: "worker-001",
        role: "worker",
        skill: "robot.query_status",
        intent: { skill: "robot.query_status", target: { robot_id: "m20-001" } },
      }).allowed,
    ).toBe(true);

    const control = evaluateRobot({
      user_id: "worker-001",
      role: "worker",
      skill: "robot.move",
      intent: {
        skill: "robot.move",
        target: { robot_id: "m20-001" },
        parameters: { direction: "forward", duration_ms: 1000 },
      },
      device: activeRobotDevice,
    });
    expect(control.allowed).toBe(false);
    expect(control.reason).toContain("工人账号");
  });

  it("requires confirmation for robot movement and waypoint navigation", () => {
    const move = evaluateRobot({
      user_id: "owner-001",
      role: "owner",
      skill: "robot.move",
      intent: {
        skill: "robot.move",
        target: { robot_id: "m20-001" },
        parameters: { direction: "forward", duration_ms: 1000 },
      },
      device: activeRobotDevice,
    });
    expect(move.allowed).toBe(true);
    expect(move.requires_confirmation).toBe(true);

    const nav = evaluateRobot({
      user_id: "owner-001",
      role: "owner",
      skill: "robot.navigate_to_waypoint",
      intent: {
        skill: "robot.navigate_to_waypoint",
        target: { robot_id: "m20-001" },
        parameters: { waypoint_id: "gate" },
      },
      device: activeRobotDevice,
    });
    expect(nav.allowed).toBe(true);
    expect(nav.requires_confirmation).toBe(true);
  });

  it("requires confirmation for robot gimbal movement and audio playback", () => {
    const gimbal = evaluateRobot({
      user_id: "owner-001",
      role: "owner",
      skill: "robot.gimbal_move",
      intent: {
        skill: "robot.gimbal_move",
        target: { robot_id: "m20-001" },
        parameters: { direction: "left", duration_ms: 1000 },
      },
      device: activeRobotDevice,
    });
    expect(gimbal.allowed).toBe(true);
    expect(gimbal.requires_confirmation).toBe(true);

    const audio = evaluateRobot({
      user_id: "owner-001",
      role: "owner",
      skill: "robot.play_audio",
      intent: {
        skill: "robot.play_audio",
        target: { robot_id: "m20-001" },
        parameters: { file_name: "welcome.mp3" },
      },
      device: activeRobotDevice,
    });
    expect(audio.allowed).toBe(true);
    expect(audio.requires_confirmation).toBe(true);
  });

  it("requires confirmation at 600s threshold boundary", () => {
    const below = evaluateGreenhouse({
      user_id: "owner-001",
      role: "owner",
      skill: "greenhouse.open_vent",
      intent: {
        ...openVentIntent,
        parameters: { duration_seconds: 599 },
      },
      device: activeDevice,
    });
    expect(below.allowed).toBe(true);
    expect(below.requires_confirmation).toBe(false);

    const at = evaluateGreenhouse({
      user_id: "owner-001",
      role: "owner",
      skill: "greenhouse.open_vent",
      intent: {
        ...openVentIntent,
        parameters: { duration_seconds: 600 },
      },
      device: activeDevice,
    });
    expect(at.allowed).toBe(true);
    expect(at.requires_confirmation).toBe(true);
  });

  it("honors per-device confirm_duration_threshold_seconds override", () => {
    const d = evaluateGreenhouse({
      user_id: "owner-001",
      role: "owner",
      skill: "greenhouse.open_vent",
      intent: {
        ...openVentIntent,
        parameters: { duration_seconds: 899 },
      },
      device: activeDevice,
      confirm_duration_threshold_seconds: 900,
    });
    expect(d.requires_confirmation).toBe(false);

    const d2 = evaluateGreenhouse({
      user_id: "owner-001",
      role: "owner",
      skill: "greenhouse.open_vent",
      intent: {
        ...openVentIntent,
        parameters: { duration_seconds: 900 },
      },
      device: activeDevice,
      confirm_duration_threshold_seconds: 900,
    });
    expect(d2.requires_confirmation).toBe(true);
  });

  it("rejects opposite-direction open_vent without duration while close is running", () => {
    const d = evaluateGreenhouse({
      user_id: "owner-001",
      role: "owner",
      skill: "greenhouse.open_vent",
      intent: {
        skill: "greenhouse.open_vent",
        target: { greenhouse_id: "gh-001" },
      },
      device: { ...activeDevice, running_action: "close" as const },
    });
    expect(d.allowed).toBe(false);
    expect(d.reject_code).toBe("interlock_direction_conflict");
  });

  it("rejects opposite-direction close_vent with duration while open is running", () => {
    const d = evaluateGreenhouse({
      user_id: "owner-001",
      role: "owner",
      skill: "greenhouse.close_vent",
      intent: {
        skill: "greenhouse.close_vent",
        target: { greenhouse_id: "gh-001" },
        parameters: { duration_seconds: 300 },
      },
      device: { ...activeDevice, running_action: "open" as const },
    });
    expect(d.allowed).toBe(false);
    expect(d.reject_code).toBe("interlock_direction_conflict");
  });

  it("allows same-direction open_vent without duration while open is running", () => {
    const d = evaluateGreenhouse({
      user_id: "owner-001",
      role: "owner",
      skill: "greenhouse.open_vent",
      intent: {
        skill: "greenhouse.open_vent",
        target: { greenhouse_id: "gh-001" },
      },
      device: { ...activeDevice, running_action: "open" as const },
    });
    expect(d.allowed).toBe(true);
  });

  it("rejects fan.start without duration", () => {
    const d = evaluateGreenhouse({
      user_id: "owner-001",
      role: "owner",
      skill: "fan.start",
      intent: {
        skill: "fan.start",
        target: { fan_id: "fan-sim-gh-001" },
      },
      device: activeDevice,
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("时长");
  });

  it("rejects when manual override active", () => {
    const d = evaluateGreenhouse({
      user_id: "owner-001",
      role: "owner",
      skill: "greenhouse.open_vent",
      intent: openVentIntent,
      device: { ...activeDevice, manual_override: true },
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("手动");
  });
});
