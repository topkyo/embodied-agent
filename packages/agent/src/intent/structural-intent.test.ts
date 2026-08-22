import { describe, expect, it } from "vitest";
import {
  refineStructuralIntentFromUtterance,
  tryStructuralIntentOverride,
} from "./structural-intent.js";
import { bindTestAgentRuntime } from "../../test/bind-test-runtime.js";

const bindings = bindTestAgentRuntime();

describe("tryStructuralIntentOverride", () => {
  it("maps A区灌溉5分钟 to irrigation.start zone-a without greenhouse", () => {
    const intent = tryStructuralIntentOverride(bindings, "A区灌溉5分钟");
    expect(intent?.skill).toBe("irrigation.start");
    if (intent?.skill === "irrigation.start") {
      expect(intent.target.zone_id).toBe("zone-a");
      expect(intent.parameters.duration_seconds).toBe(300);
      expect("greenhouse_id" in intent.target).toBe(false);
    }
  });

  it("does not turn negative irrigation utterances into irrigation.start", () => {
    expect(tryStructuralIntentOverride(bindings, "不要给A区浇水5分钟")).toBeNull();
    expect(tryStructuralIntentOverride(bindings, "A区浇水状态5分钟")).toBeNull();
  });

  it("maps generic recent command status query", () => {
    const intent = tryStructuralIntentOverride(bindings, "刚才指令执行了吗");
    expect(intent?.skill).toBe("command.query_status");
    if (intent?.skill === "command.query_status") {
      expect(intent.parameters?.recent).toBe(true);
    }
  });

  it("maps night mode status query to set_mode command status", () => {
    const intent = tryStructuralIntentOverride(bindings, "1号棚夜间通风开了吗");
    expect(intent?.skill).toBe("command.query_status");
    if (intent?.skill === "command.query_status") {
      expect(intent.target.greenhouse_id).toBe("gh-001");
      expect(intent.parameters?.action).toBe("set_mode");
    }
  });

  it("maps multi-greenhouse night mode status query without target", () => {
    const intent = tryStructuralIntentOverride(bindings, "1号棚和2号棚夜间模式开了吗");
    expect(intent?.skill).toBe("command.query_status");
    if (intent?.skill === "command.query_status") {
      expect(intent.target).toEqual({});
      expect(intent.parameters?.action).toBe("set_mode");
    }
  });

  it("maps greenhouse night mode enable question to set_mode", () => {
    const intent = tryStructuralIntentOverride(bindings, "1号棚可以开启夜间模式吗");
    expect(intent?.skill).toBe("greenhouse.set_mode");
    if (intent?.skill === "greenhouse.set_mode") {
      expect(intent.target.greenhouse_id).toBe("gh-001");
      expect(intent.parameters.mode).toBe("night_vent");
    }
  });

  it("maps 也是30度 with gh-001 alert history to gh-002 threshold", () => {
    const intent = tryStructuralIntentOverride(bindings, "也是30度", [
      { role: "user", content: "1号棚温度超过30度就报警" },
      { role: "assistant", content: "已设置 gh-001 报警阈值。" },
    ]);
    expect(intent?.skill).toBe("alert.set_threshold");
    if (intent?.skill === "alert.set_threshold") {
      expect(intent.target.greenhouse_id).toBe("gh-002");
      expect(intent.parameters).toMatchObject({
        metric: "temperature_c",
        operator: ">",
        value: 30,
      });
    }
  });

  it("returns null for unrelated utterances", () => {
    expect(tryStructuralIntentOverride(bindings, "1号棚现在多少度")).toBeNull();
  });

  it("maps 2号棚湿度报警阈值 to alert.query_threshold", () => {
    const intent = tryStructuralIntentOverride(bindings, "2号棚湿度报警阈值");
    expect(intent?.skill).toBe("alert.query_threshold");
    if (intent?.skill === "alert.query_threshold") {
      expect(intent.target.greenhouse_id).toBe("gh-002");
    }
  });

  it("maps 1号棚自动通风 to greenhouse.set_mode night_vent", () => {
    const intent = tryStructuralIntentOverride(bindings, "1号棚自动通风");
    expect(intent?.skill).toBe("greenhouse.set_mode");
    if (intent?.skill === "greenhouse.set_mode") {
      expect(intent.target.greenhouse_id).toBe("gh-001");
      expect(intent.parameters.mode).toBe("night_vent");
    }
  });

  it("maps door opening slang to greenhouse.open_vent", () => {
    const intent = tryStructuralIntentOverride(bindings, "把2号门打开5分钟");
    expect(intent?.skill).toBe("greenhouse.open_vent");
    if (intent?.skill === "greenhouse.open_vent") {
      expect(intent.target.greenhouse_id).toBe("gh-002");
      expect(intent.parameters.duration_seconds).toBe(300);
    }
  });

  it("maps stop greenhouse fan to the default fan", () => {
    const intent = tryStructuralIntentOverride(bindings, "停2号棚的风机");
    expect(intent?.skill).toBe("fan.stop");
    if (intent?.skill === "fan.stop") {
      expect(intent.target.fan_id).toBe("fan-gh-002-01");
    }
  });

  it("does not start fan without duration", () => {
    expect(tryStructuralIntentOverride(bindings, "打开1号棚风机")).toBeNull();
  });

  it("maps contextual enable confirmation to night vent mode", () => {
    const intent = tryStructuralIntentOverride(bindings, "可以开启吗", [
      { role: "user", content: "1号棚夜间别超过30度" },
      { role: "assistant", content: "将启用夜间自动通风模式。请直接回复「确认」。" },
    ]);
    expect(intent?.skill).toBe("greenhouse.set_mode");
    if (intent?.skill === "greenhouse.set_mode") {
      expect(intent.target.greenhouse_id).toBe("gh-001");
      expect(intent.parameters.mode).toBe("night_vent");
    }
  });

  it("does not map auto-vent query or off utterances to night_vent", () => {
    expect(tryStructuralIntentOverride(bindings, "1号棚自动通风开了吗")).toBeNull();
    expect(tryStructuralIntentOverride(bindings, "关闭1号棚夜间自动通风")).toBeNull();
  });

  it("maps ambiguous auto-vent off to clarification", () => {
    const intent = tryStructuralIntentOverride(bindings, "关闭夜间通风");
    expect(intent?.skill).toBe("clarification_needed");
  });

  it("refineStructuralIntentFromUtterance adds gh-001 for 1号大棚", () => {
    const intent = refineStructuralIntentFromUtterance(bindings, "给1号大棚开启灌溉水30分钟", {
      skill: "irrigation.start",
      target: { zone_id: "zone-a" },
      parameters: { duration_seconds: 1800 },
    });
    if (intent.skill === "irrigation.start") {
      expect(intent.target.greenhouse_id).toBe("gh-001");
    }
  });

  it("refineStructuralIntentFromUtterance adds gh-001 for stopping zone-a irrigation", () => {
    const intent = refineStructuralIntentFromUtterance(bindings, "停止A区灌溉", {
      skill: "irrigation.stop",
      target: { zone_id: "zone-a" },
    });
    if (intent.skill === "irrigation.stop") {
      expect(intent.target.greenhouse_id).toBe("gh-001");
    }
  });

  it("refineStructuralIntentFromUtterance rejects robot terms in agriculture", () => {
    const intent = refineStructuralIntentFromUtterance(bindings, "M20 去充电桩", {
      skill: "tasks.create_task",
      target: {},
      parameters: { title: "M20 去充电桩" },
    });
    expect(intent.skill).toBe("clarification_needed");
  });

  it("refineStructuralIntentFromUtterance rejects unknown greenhouse ids", () => {
    const intent = refineStructuralIntentFromUtterance(bindings, "三号棚多少度", {
      skill: "greenhouse.query_status",
      target: { greenhouse_id: "gh-003" },
    });
    expect(intent.skill).toBe("clarification_needed");
  });
});
