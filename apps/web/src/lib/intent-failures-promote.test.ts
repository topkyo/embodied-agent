import { describe, expect, it } from "vitest";
import { AdminFetchError } from "../api";
import { formatPromoteFeedback, promoteErrorMessage } from "./intent-failures-promote";

const t = (key: string) =>
  key === "settings.intentFailures.result.promoted"
    ? "Promoted {n}"
    : key === "settings.intentFailures.result.failed"
      ? "Failed {n}"
      : key;

describe("formatPromoteFeedback", () => {
  it("returns success message when promoted", () => {
    const out = formatPromoteFeedback(
      { ok: true, promoted: 2, skipped: 0, failed: 0, results: [] },
      t,
    );
    expect(out.msg).toBe("Promoted 2");
    expect(out.err).toBeNull();
  });

  it("returns error when matrix failed", () => {
    const out = formatPromoteFeedback(
      {
        ok: false,
        promoted: 0,
        skipped: 0,
        failed: 1,
        sim_exit_code: 1,
        results: [{ id: "f-1", utterance: "x", status: "failed", error: "wechat_matrix_failed" }],
        error: "wechat matrix validation failed",
      },
      t,
    );
    expect(out.msg).toBeNull();
    expect(out.err).toContain("wechat matrix validation failed");
    expect(out.err).toContain("sim exit 1");
  });
});

describe("promoteErrorMessage", () => {
  it("formats AdminFetchError with body details", () => {
    const err = new AdminFetchError("promote already in progress", 409, {
      ok: false,
      promoted: 0,
      skipped: 0,
      failed: 0,
      results: [],
      error: "promote already in progress",
    });
    expect(promoteErrorMessage(err)).toContain("promote already in progress");
  });
});
