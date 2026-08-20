import { describe, expect, it } from "vitest";
import {
  isSustainedThresholdMet,
  nextSustainedEpisodeTick,
  shouldEvaluateSustainedL1,
  shouldEvaluateSustainedL2,
} from "./sustained.js";

describe("sustained episode evaluation", () => {
  it("resets streak when breach clears", () => {
    expect(
      nextSustainedEpisodeTick(
        { streak_minutes: 4, episode_started_at: "2026-01-01T00:00:00.000Z" },
        false,
        "2026-01-01T00:05:00.000Z",
      ),
    ).toEqual({ streak_minutes: 0 });
  });

  it("increments streak and preserves sent markers while breaching", () => {
    expect(
      nextSustainedEpisodeTick(
        {
          streak_minutes: 2,
          episode_started_at: "2026-01-01T00:00:00.000Z",
          l1_sent_at: "2026-01-01T00:02:00.000Z",
        },
        true,
        "2026-01-01T00:03:00.000Z",
      ),
    ).toEqual({
      streak_minutes: 3,
      episode_started_at: "2026-01-01T00:00:00.000Z",
      l1_sent_at: "2026-01-01T00:02:00.000Z",
    });
  });

  it("gates L1/L2 evaluation on streak and prior sends", () => {
    const episode = { streak_minutes: 3, l1_sent_at: "2026-01-01T00:03:00.000Z" };
    expect(isSustainedThresholdMet(episode, 3, true)).toBe(true);
    expect(shouldEvaluateSustainedL1(episode, 3, true)).toBe(false);
    expect(shouldEvaluateSustainedL2(episode, true)).toBe(true);
    expect(shouldEvaluateSustainedL2({ streak_minutes: 3 }, true)).toBe(false);
  });

  it("blocks L1 while a reservation is in flight", () => {
    const episode = {
      streak_minutes: 3,
      l1_reserved_at: "2026-01-01T00:03:00.000Z",
    };
    expect(shouldEvaluateSustainedL1(episode, 3, true)).toBe(false);
  });
});
