import { describe, expect, it } from "vitest";
import {
  industrialCommandStatusMessage,
  industrialPendingSummary,
  industrialPhysicalCommandSentReply,
} from "./command-replies.js";

describe("industrial command replies", () => {
  it("covers sent and pending copy", () => {
    expect(industrialPhysicalCommandSentReply("industrial.start_exhaust")).toMatch(/排风/);
    expect(
      industrialPendingSummary({
        skill: "industrial.start_exhaust",
        target: { cabinet_id: "cabinet-001" },
        parameters: { duration_seconds: 60 },
      } as never),
    ).toContain("cabinet-001");
  });

  it("formats command status messages", () => {
    expect(
      industrialCommandStatusMessage({
        status: "completed",
        command: { device_id: "fan-1", action: "start" },
      }),
    ).toMatch(/已完成/);
    expect(
      industrialCommandStatusMessage({
        status: "failed",
        command: { device_id: "fan-1" },
        error: { message: "timeout_ack" },
      }),
    ).toMatch(/timeout_ack/);
    expect(industrialCommandStatusMessage({ status: "running" })).toBeNull();
  });
});
