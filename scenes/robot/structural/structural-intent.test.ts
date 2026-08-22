import { describe, expect, it } from "vitest";
import { tryStructuralIntentOverride } from "./structural-intent.js";

describe("robot structural intent override", () => {
  it("maps concise robot control utterances after LLM clarification", () => {
    expect(tryStructuralIntentOverride("打开工作灯")?.skill).toBe("robot.set_light");
    expect(tryStructuralIntentOverride("往前走1秒")?.skill).toBe("robot.move");
    expect(tryStructuralIntentOverride("云台向左转一下")?.skill).toBe("robot.gimbal_move");
  });

  it("maps gimbal capture utterances deterministically", () => {
    const result = tryStructuralIntentOverride("吊舱拍一张可见光照片");
    expect(result?.skill).toBe("robot.gimbal_capture");
    expect(result?.parameters).toEqual({ mode: "visible" });
  });

  it("does not turn negated or query utterances into control actions", () => {
    expect(tryStructuralIntentOverride("不要打开工作灯")).toBeNull();
    expect(tryStructuralIntentOverride("别往前走1秒")).toBeNull();
    expect(tryStructuralIntentOverride("云台现在向左了吗")).toBeNull();
    expect(tryStructuralIntentOverride("工作灯状态")).toBeNull();
    expect(tryStructuralIntentOverride("不要拍现场图")).toBeNull();
  });
});
