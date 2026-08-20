import { describe, expect, it } from "vitest";
import type { CommandRow } from "../../../api/commands.js";
import { stagesForCommand, focusProgressStage } from "./commandStages.js";

function row(status: string): CommandRow {
  return {
    command_id: "cmd-1",
    status,
    updated_at: "2026-07-01T00:00:00.000Z",
    command: { device_id: "gh-001", action: "vent", issued_by: { user_id: "u-1" } },
  };
}

describe("stagesForCommand", () => {
  it("defaults missing status to understand", () => {
    const bare = { ...row(""), status: undefined as unknown as string };
    expect(stagesForCommand(bare)).toEqual({ current: "understand", completed: [] });
    expect(stagesForCommand(row(""))).toEqual({ current: "understand", completed: [] });
  });

  it("maps confirm-stage statuses", () => {
    expect(stagesForCommand(row("pending"))).toEqual({
      current: "confirm",
      completed: ["understand"],
    });
    expect(stagesForCommand(row("awaiting_confirm"))).toEqual({
      current: "confirm",
      completed: ["understand"],
    });
  });

  it("maps execute-stage statuses", () => {
    for (const status of ["created", "sent", "running", "dispatched", "acknowledged"]) {
      expect(stagesForCommand(row(status))).toEqual({
        current: "execute",
        completed: ["understand", "confirm"],
      });
    }
  });

  it("maps terminal statuses to ack", () => {
    for (const status of ["completed", "success", "succeeded", "failed", "timeout", "rejected"]) {
      expect(stagesForCommand(row(status))).toEqual({
        current: "ack",
        completed: ["understand", "confirm", "execute"],
      });
    }
  });

  it("maps unknown statuses to understand", () => {
    expect(stagesForCommand(row("queued"))).toEqual({ current: "understand", completed: [] });
  });
});

describe("focusProgressStage", () => {
  it("uses confirm when pending exists", () => {
    expect(focusProgressStage(1, row("completed"))).toEqual({
      current: "confirm",
      completed: ["understand"],
    });
  });

  it("uses newest command when no pending", () => {
    expect(focusProgressStage(0, row("running"))).toEqual({
      current: "execute",
      completed: ["understand", "confirm"],
    });
  });

  it("defaults to understand with no pending or command", () => {
    expect(focusProgressStage(0)).toEqual({ current: "understand", completed: [] });
  });
});
