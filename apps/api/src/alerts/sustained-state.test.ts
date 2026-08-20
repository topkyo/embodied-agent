import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  confirmSustainedL1Sent,
  getSustainedEpisode,
  releaseSustainedL1Reservation,
  reserveSustainedL1Send,
  tickSustainedEpisode,
} from "./sustained-state.js";

let testDir: string;

describe("sustained-state", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    mkdirSync(resolve(testDir, "deployments", "dep-gh-pilot-001"), { recursive: true });
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("tickSustainedEpisode only continues the exact deployment-scoped episode", async () => {
    const currentKey = "dep-gh-pilot-001:gh-001:temperature_c:>:30";
    await tickSustainedEpisode(
      "gh-001:temperature_c:>:30",
      true,
      new Date("2026-01-01T00:05:00.000Z"),
      "dep-gh-pilot-001",
    );

    const episode = await tickSustainedEpisode(
      currentKey,
      true,
      new Date("2026-01-01T00:06:00.000Z"),
      "dep-gh-pilot-001",
    );
    expect(episode.streak_minutes).toBe(1);
    expect(episode.l1_sent_at).toBeUndefined();
  });

  it("throws on corrupt sustained state instead of clearing it", async () => {
    writeFileSync(
      resolve(testDir, "deployments", "dep-gh-pilot-001", "sustained-anomaly-state.json"),
      "{",
      "utf8",
    );

    await expect(
      tickSustainedEpisode("rule", true, new Date(), "dep-gh-pilot-001"),
    ).rejects.toThrow();
  });

  it("throws when SUSTAINED_L1_RESERVATION_TTL_SECONDS is invalid", async () => {
    const currentKey = "dep-gh-pilot-001:gh-001:temperature_c:>:30";
    for (let i = 0; i < 3; i++) {
      await tickSustainedEpisode(
        currentKey,
        true,
        new Date(`2026-01-01T00:0${i}:00.000Z`),
        "dep-gh-pilot-001",
      );
    }
    process.env.SUSTAINED_L1_RESERVATION_TTL_SECONDS = "0";
    await expect(
      reserveSustainedL1Send(currentKey, 3, true, new Date(), "dep-gh-pilot-001"),
    ).rejects.toThrow(/SUSTAINED_L1_RESERVATION_TTL_SECONDS/);
    delete process.env.SUSTAINED_L1_RESERVATION_TTL_SECONDS;
  });

  it("expires stale L1 reservations on tick", async () => {
    process.env.SUSTAINED_L1_RESERVATION_TTL_SECONDS = "60";
    const currentKey = "dep-gh-pilot-001:gh-001:temperature_c:>:30";
    for (let i = 0; i < 3; i++) {
      await tickSustainedEpisode(
        currentKey,
        true,
        new Date(`2026-01-01T00:0${i}:00.000Z`),
        "dep-gh-pilot-001",
      );
    }
    expect(
      await reserveSustainedL1Send(
        currentKey,
        3,
        true,
        new Date("2026-01-01T00:03:00.000Z"),
        "dep-gh-pilot-001",
      ),
    ).not.toBeNull();

    const episode = await tickSustainedEpisode(
      currentKey,
      true,
      new Date("2026-01-01T00:05:00.000Z"),
      "dep-gh-pilot-001",
    );
    expect(episode.l1_reserved_at).toBeUndefined();
    expect(
      await reserveSustainedL1Send(
        currentKey,
        3,
        true,
        new Date("2026-01-01T00:05:00.000Z"),
        "dep-gh-pilot-001",
      ),
    ).not.toBeNull();
    delete process.env.SUSTAINED_L1_RESERVATION_TTL_SECONDS;
  });

  it("getSustainedEpisode persists expired L1 reservation cleanup", async () => {
    const currentKey = "dep-gh-pilot-001:gh-001:temperature_c:>:30";
    const statePath = resolve(
      testDir,
      "deployments",
      "dep-gh-pilot-001",
      "sustained-anomaly-state.json",
    );
    writeFileSync(
      statePath,
      JSON.stringify({
        episodes: {
          [currentKey]: {
            streak_minutes: 3,
            l1_reserved_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          },
        },
      }),
      "utf8",
    );

    const episode = await getSustainedEpisode(currentKey, "dep-gh-pilot-001");
    expect(episode?.l1_reserved_at).toBeUndefined();

    const persisted = JSON.parse(readFileSync(statePath, "utf8")) as {
      episodes: Record<string, { l1_reserved_at?: string }>;
    };
    expect(persisted.episodes[currentKey]?.l1_reserved_at).toBeUndefined();
  });

  it("releases L1 reservation so a failed send can retry", async () => {
    const currentKey = "dep-gh-pilot-001:gh-001:temperature_c:>:30";
    for (let i = 0; i < 3; i++) {
      await tickSustainedEpisode(
        currentKey,
        true,
        new Date(`2026-01-01T00:0${i}:00.000Z`),
        "dep-gh-pilot-001",
      );
    }

    expect(
      await reserveSustainedL1Send(currentKey, 3, true, new Date(), "dep-gh-pilot-001"),
    ).not.toBeNull();
    await releaseSustainedL1Reservation(currentKey, "dep-gh-pilot-001");
    expect(
      await reserveSustainedL1Send(currentKey, 3, true, new Date(), "dep-gh-pilot-001"),
    ).not.toBeNull();
    await confirmSustainedL1Sent(currentKey, new Date(), "dep-gh-pilot-001");
    expect(
      await reserveSustainedL1Send(currentKey, 3, true, new Date(), "dep-gh-pilot-001"),
    ).toBeNull();
  });

  it("throws on invalid sustained state schema instead of clearing it", async () => {
    writeFileSync(
      resolve(testDir, "deployments", "dep-gh-pilot-001", "sustained-anomaly-state.json"),
      JSON.stringify({ episodes: { rule: {} } }),
      "utf8",
    );

    await expect(
      tickSustainedEpisode("rule", true, new Date(), "dep-gh-pilot-001"),
    ).rejects.toThrow(/streak_minutes/);
  });
});
