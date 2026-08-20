import { describe, expect, it } from "vitest";
import type { PendingConfirmView } from "../../../api/settings.js";
import {
  filterActivePendingConfirms,
  isPendingConfirmExpired,
  remainingMs,
} from "./projectPendingConfirm.js";

const NOW = 1_700_000_000_000;

function pending(partial: Partial<PendingConfirmView> = {}): PendingConfirmView {
  return {
    user_id: "u-1",
    created_at: NOW - 60_000,
    expires_at: NOW + 120_000,
    action_summary: "vent",
    target_summary: "gh-001",
    ...partial,
  };
}

describe("remainingMs", () => {
  it("returns positive ms until expiry", () => {
    expect(remainingMs(pending({ expires_at: NOW + 90_000 }), NOW)).toBe(90_000);
  });

  it("clamps to zero when expired", () => {
    expect(remainingMs(pending({ expires_at: NOW - 1 }), NOW)).toBe(0);
  });
});

describe("isPendingConfirmExpired", () => {
  it("is false before expires_at", () => {
    expect(isPendingConfirmExpired(pending({ expires_at: NOW + 1 }), NOW)).toBe(false);
  });

  it("is true at or after expires_at", () => {
    expect(isPendingConfirmExpired(pending({ expires_at: NOW }), NOW)).toBe(true);
    expect(isPendingConfirmExpired(pending({ expires_at: NOW - 1 }), NOW)).toBe(true);
  });
});

describe("filterActivePendingConfirms", () => {
  it("drops expired rows", () => {
    const items = [
      pending({ user_id: "a", expires_at: NOW + 1 }),
      pending({ user_id: "b", expires_at: NOW }),
      pending({ user_id: "c", expires_at: NOW - 1 }),
    ];
    expect(filterActivePendingConfirms(items, NOW).map((i) => i.user_id)).toEqual(["a"]);
  });
});
