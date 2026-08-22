import { describe, expect, it } from "vitest";
import { tryStructuralIntentOverride } from "./structural-intent.js";

describe("industrial structural intent override", () => {
  it("maps status and exhaust utterances", () => {
    expect(tryStructuralIntentOverride("三号柜温度多少")?.skill).toBe("industrial.query_status");
    expect(tryStructuralIntentOverride("停排风")?.skill).toBe("industrial.stop_exhaust");
    expect(tryStructuralIntentOverride("查状态")?.skill).toBe("industrial.query_status");
  });

  it("uses default duration for start exhaust when not specified", () => {
    expect(tryStructuralIntentOverride("开排风")?.skill).toBe("industrial.start_exhaust");
    expect(tryStructuralIntentOverride("开排风")?.parameters).toEqual({ duration_seconds: 600 });
    expect(tryStructuralIntentOverride("排风开起")?.skill).toBe("industrial.start_exhaust");
    expect(tryStructuralIntentOverride("排风开起")?.parameters).toEqual({ duration_seconds: 600 });
    expect(tryStructuralIntentOverride("开排风15分钟")?.skill).toBe("industrial.start_exhaust");
    expect(tryStructuralIntentOverride("开排风15分钟")?.parameters).toEqual({
      duration_seconds: 900,
    });
  });

  it("maps exhaust query utterances to command.query_status", () => {
    expect(tryStructuralIntentOverride("排风开了没")?.skill).toBe("industrial.query_status");
    expect(tryStructuralIntentOverride("排风开了多久了")?.skill).toBe("command.query_status");
    expect(tryStructuralIntentOverride("排风开了多久了")?.parameters).toEqual({
      action: "start_exhaust",
    });
  });

  it("maps failing matrix utterances", () => {
    expect(tryStructuralIntentOverride("机房是不是过热了")?.skill).toBe("industrial.query_status");
    expect(tryStructuralIntentOverride("排风现在开了吗")?.skill).toBe("industrial.query_status");
    expect(tryStructuralIntentOverride("热了帮我排一下")?.skill).toBe("industrial.start_exhaust");
    expect(tryStructuralIntentOverride("热了帮我排一下")?.parameters).toEqual({
      duration_seconds: 600,
    });
    expect(tryStructuralIntentOverride("通风停了吗")?.skill).toBe("industrial.stop_exhaust");
  });

  it("does not override cross-domain utterances mentioning fans or ventilation", () => {
    expect(tryStructuralIntentOverride("给我打开风机")).toBeNull();
    expect(tryStructuralIntentOverride("像大棚那样开风机")).toBeNull();
    expect(tryStructuralIntentOverride("打开温室通风")).toBeNull();
  });

  it("returns null for unknown utterances", () => {
    expect(tryStructuralIntentOverride("随便说点别的")).toBeNull();
  });
});
