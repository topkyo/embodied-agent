import { describe, expect, it } from "vitest";
import { tryMergePendingClarification } from "./clarification-merge.js";

const GREENHOUSE_ALIASES = {
  "gh-001": ["1号棚", "一号棚", "1棚"],
  "gh-002": ["2号棚", "二号棚", "2棚"],
};

describe("tryMergePendingClarification", () => {
  it("fills greenhouse after duration-only pending", () => {
    const merged = tryMergePendingClarification(
      "一号棚",
      {
        deployment_id: "dep-gh-pilot-001",
        user_id: "u1",
        conversation_id: "c1",
        expected_skill: "greenhouse.open_vent",
        missing_slots: ["greenhouse_id"],
        partial: { duration_seconds: 900 },
        created_at: 0,
        expires_at: 9999999999999,
      },
      GREENHOUSE_ALIASES,
    );
    expect(merged.kind).toBe("intent");
    if (merged.kind === "intent" && merged.intent.skill === "greenhouse.open_vent") {
      const params = merged.intent.parameters as { duration_seconds?: number };
      expect(merged.intent.target.greenhouse_id).toBe("gh-001");
      expect(params.duration_seconds).toBe(900);
    }
  });

  it("replaces duration when user states new minutes during clarification", () => {
    const merged = tryMergePendingClarification(
      "开10分钟",
      {
        deployment_id: "dep-gh-pilot-001",
        user_id: "u1",
        conversation_id: "c1",
        expected_skill: "greenhouse.open_vent",
        missing_slots: ["duration_seconds"],
        partial: { greenhouse_id: "gh-002", duration_seconds: 1200 },
        last_rejected_intent: {
          skill: "greenhouse.open_vent",
          target: { greenhouse_id: "gh-002" },
          parameters: { duration_seconds: 1200 },
        },
        created_at: 0,
        expires_at: 9999999999999,
      },
      GREENHOUSE_ALIASES,
    );
    expect(merged.kind).toBe("intent");
    if (merged.kind === "intent" && merged.intent.skill === "greenhouse.open_vent") {
      const params = merged.intent.parameters as { duration_seconds?: number };
      expect(merged.intent.target.greenhouse_id).toBe("gh-002");
      expect(params.duration_seconds).toBe(600);
    }
  });

  it("maps night mode continuation after reject", () => {
    const merged = tryMergePendingClarification(
      "那就开夜间模式",
      {
        deployment_id: "dep-gh-pilot-001",
        user_id: "u1",
        conversation_id: "c1",
        missing_slots: [],
        partial: {},
        last_rejected_intent: {
          skill: "greenhouse.open_vent",
          target: { greenhouse_id: "gh-002" },
          parameters: { duration_seconds: 1200 },
        },
        created_at: 0,
        expires_at: 9999999999999,
      },
      GREENHOUSE_ALIASES,
    );
    expect(merged.kind).toBe("intent");
    if (merged.kind === "intent") {
      expect(merged.intent.skill).toBe("greenhouse.set_mode");
      if (merged.intent.skill === "greenhouse.set_mode") {
        expect(merged.intent.target.greenhouse_id).toBe("gh-002");
      }
    }
  });

  it("detects suppress L2 preference", () => {
    const merged = tryMergePendingClarification(
      "今晚别提醒",
      {
        deployment_id: "dep-gh-pilot-001",
        user_id: "u1",
        conversation_id: "c1",
        missing_slots: [],
        partial: {},
        created_at: 0,
        expires_at: 9999999999999,
      },
      GREENHOUSE_ALIASES,
    );
    expect(merged.kind).toBe("notification_pref");
  });
});
