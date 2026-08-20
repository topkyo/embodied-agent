import { describe, expect, it } from "vitest";
import { TERMINAL_STATUSES, canApplyCommandEvent } from "./store-transitions.js";
import type { CommandLifecycleStatus } from "./types.js";

describe("TERMINAL_STATUSES", () => {
  it("includes completed, rejected, failed, timeout", () => {
    expect(TERMINAL_STATUSES.has("completed")).toBe(true);
    expect(TERMINAL_STATUSES.has("rejected")).toBe(true);
    expect(TERMINAL_STATUSES.has("failed")).toBe(true);
    expect(TERMINAL_STATUSES.has("timeout")).toBe(true);
  });

  it("does not include non-terminal statuses", () => {
    expect(TERMINAL_STATUSES.has("created")).toBe(false);
    expect(TERMINAL_STATUSES.has("sent")).toBe(false);
    expect(TERMINAL_STATUSES.has("acknowledged")).toBe(false);
    expect(TERMINAL_STATUSES.has("running")).toBe(false);
  });
});

describe("canApplyCommandEvent", () => {
  describe("created → next", () => {
    it("allows acknowledged", () => {
      expect(canApplyCommandEvent("created", "acknowledged")).toBe(true);
    });
    it("allows running", () => {
      expect(canApplyCommandEvent("created", "running")).toBe(true);
    });
    it("allows rejected", () => {
      expect(canApplyCommandEvent("created", "rejected")).toBe(true);
    });
    it("allows failed", () => {
      expect(canApplyCommandEvent("created", "failed")).toBe(true);
    });
    it("allows completed", () => {
      expect(canApplyCommandEvent("created", "completed")).toBe(true);
    });
  });

  describe("sent → next", () => {
    it("allows acknowledged", () => {
      expect(canApplyCommandEvent("sent", "acknowledged")).toBe(true);
    });
    it("allows running", () => {
      expect(canApplyCommandEvent("sent", "running")).toBe(true);
    });
    it("allows rejected", () => {
      expect(canApplyCommandEvent("sent", "rejected")).toBe(true);
    });
    it("allows failed", () => {
      expect(canApplyCommandEvent("sent", "failed")).toBe(true);
    });
    it("allows completed", () => {
      expect(canApplyCommandEvent("sent", "completed")).toBe(true);
    });
  });

  describe("acknowledged → next", () => {
    it("allows running", () => {
      expect(canApplyCommandEvent("acknowledged", "running")).toBe(true);
    });
    it("allows rejected", () => {
      expect(canApplyCommandEvent("acknowledged", "rejected")).toBe(true);
    });
    it("allows failed", () => {
      expect(canApplyCommandEvent("acknowledged", "failed")).toBe(true);
    });
    it("allows completed", () => {
      expect(canApplyCommandEvent("acknowledged", "completed")).toBe(true);
    });
    it("rejects acknowledged (no self-loop)", () => {
      expect(canApplyCommandEvent("acknowledged", "acknowledged")).toBe(false);
    });
  });

  describe("running → next", () => {
    it("allows completed", () => {
      expect(canApplyCommandEvent("running", "completed")).toBe(true);
    });
    it("allows rejected", () => {
      expect(canApplyCommandEvent("running", "rejected")).toBe(true);
    });
    it("allows failed", () => {
      expect(canApplyCommandEvent("running", "failed")).toBe(true);
    });
    it("rejects acknowledged (no backward)", () => {
      expect(canApplyCommandEvent("running", "acknowledged")).toBe(false);
    });
    it("rejects running (no self-loop)", () => {
      expect(canApplyCommandEvent("running", "running")).toBe(false);
    });
  });

  describe("terminal statuses reject all events", () => {
    const terminalStatuses: CommandLifecycleStatus[] = [
      "completed",
      "rejected",
      "failed",
      "timeout",
    ];
    const eventStatuses = ["acknowledged", "running", "completed", "failed", "rejected"] as const;

    for (const terminal of terminalStatuses) {
      for (const evt of eventStatuses) {
        it(`rejects ${terminal} → ${evt}`, () => {
          expect(canApplyCommandEvent(terminal, evt)).toBe(false);
        });
      }
    }
  });
});
