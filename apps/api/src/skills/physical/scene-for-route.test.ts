import { describe, expect, it, vi } from "vitest";
import type { IntentPayload } from "@embodied-agent/core";

// Mock scene/registry to avoid PlatformRuntimeContext dependency.
vi.mock("../../scene/registry.js", () => ({
  resolveSceneForTrigger: (trigger: { type: string }) =>
    trigger.type === "manual_override_reject" ? "worker_manual_override_review" : undefined,
  resolveSceneFromIntent: (intent: IntentPayload) => {
    if (intent.skill === "greenhouse.set_mode" && intent.parameters?.mode === "night_vent") {
      return "night_ventilation_control";
    }
    return undefined;
  },
}));

import { resolveSceneForRoute } from "./scene-for-route.js";
import type { RouteContext } from "../route-context.js";

function makeCtx(overrides?: Partial<RouteContext>): RouteContext {
  return {
    user_id: "owner-001",
    role: "owner",
    model: "deepseek-v4-flash",
    ...overrides,
  };
}

function makeIntent(
  skill = "greenhouse.set_mode",
  parameters?: Record<string, unknown>,
): IntentPayload {
  return {
    skill,
    target: {},
    parameters,
    confidence: 0.9,
  } as IntentPayload;
}

describe("resolveSceneForRoute", () => {
  it("returns ctx.scene_skill_id when already set", () => {
    const ctx = makeCtx({ scene_skill_id: "cold_wave_protection" });
    const result = resolveSceneForRoute(makeIntent(), ctx);
    expect(result).toBe("cold_wave_protection");
  });

  it("returns manual_override_review when device has manual_override", () => {
    const ctx = makeCtx();
    const result = resolveSceneForRoute(makeIntent("greenhouse.open_vent"), ctx, {
      manual_override: true,
    });
    expect(result).toBe("worker_manual_override_review");
  });

  it("returns manual_override_review when safetyReason includes 手动优先", () => {
    const ctx = makeCtx();
    const result = resolveSceneForRoute(
      makeIntent("greenhouse.open_vent"),
      ctx,
      undefined,
      "手动优先：当前有人工操作",
    );
    expect(result).toBe("worker_manual_override_review");
  });

  it("does not return manual_override_review when safetyReason does not include 手动优先", () => {
    const ctx = makeCtx();
    const result = resolveSceneForRoute(
      makeIntent("greenhouse.open_vent"),
      ctx,
      undefined,
      "高温限位",
    );
    // safetyReason without 手动优先 falls through to resolveSceneFromIntent
    expect(result).not.toBe("worker_manual_override_review");
  });

  it("resolves night_ventilation_control from greenhouse.set_mode with night_vent", () => {
    const ctx = makeCtx();
    const result = resolveSceneForRoute(
      makeIntent("greenhouse.set_mode", { mode: "night_vent" }),
      ctx,
    );
    expect(result).toBe("night_ventilation_control");
  });

  it("returns undefined for intent without matching scene", () => {
    const ctx = makeCtx();
    const result = resolveSceneForRoute(makeIntent("greenhouse.open_vent"), ctx);
    expect(result).toBeUndefined();
  });

  it("returns undefined for intent with no parameters", () => {
    const ctx = makeCtx();
    const result = resolveSceneForRoute(makeIntent("greenhouse.set_mode"), ctx);
    expect(result).toBeUndefined();
  });

  it("prefers ctx.scene_skill_id over manual_override", () => {
    const ctx = makeCtx({ scene_skill_id: "high_temp_emergency_response" });
    const result = resolveSceneForRoute(makeIntent("greenhouse.open_vent"), ctx, {
      manual_override: true,
    });
    expect(result).toBe("high_temp_emergency_response");
  });

  it("prefers ctx.scene_skill_id over safetyReason", () => {
    const ctx = makeCtx({ scene_skill_id: "humidity_mildew_prevention" });
    const result = resolveSceneForRoute(
      makeIntent("greenhouse.open_vent"),
      ctx,
      undefined,
      "手动优先",
    );
    expect(result).toBe("humidity_mildew_prevention");
  });

  it("manual_override takes priority over intent-based scene resolution", () => {
    const ctx = makeCtx();
    const result = resolveSceneForRoute(
      makeIntent("greenhouse.set_mode", { mode: "night_vent" }),
      ctx,
      { manual_override: true },
    );
    expect(result).toBe("worker_manual_override_review");
  });
});
