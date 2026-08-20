import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  clearAlertCooldown,
  confirmAlertFired,
  confirmAlertFiredResilient,
  releaseAlertReservation,
  reserveAlertCooldown,
} from "./alert-state.js";

let testDir: string;

async function canFireAlert(
  key: string,
  cooldownSeconds: number,
  now = Date.now(),
  deployment_id = "dep-gh-pilot-001",
): Promise<boolean> {
  const reserved = await reserveAlertCooldown(key, cooldownSeconds, now, deployment_id);
  if (reserved) await releaseAlertReservation(key, deployment_id);
  return reserved;
}

describe("alert-state", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    mkdirSync(resolve(testDir, "deployments", "dep-gh-pilot-001"), { recursive: true });
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("cooldown only reads the exact deployment-scoped key", async () => {
    const oldKey = "gh-001:temperature_c:>:30";
    const currentKey = "dep-gh-pilot-001:gh-001:temperature_c:>:30";
    await confirmAlertFired(oldKey, new Date(), "dep-gh-pilot-001");

    expect(await canFireAlert(currentKey, 3600, Date.now(), "dep-gh-pilot-001")).toBe(true);

    await confirmAlertFired(currentKey, new Date(), "dep-gh-pilot-001");
    expect(await canFireAlert(currentKey, 3600, Date.now(), "dep-gh-pilot-001")).toBe(false);
  });

  it("clearAlertCooldown only clears the exact key", async () => {
    const oldKey = "sustained-l2:gh-001:temperature_c:>:30";
    const currentKey = "sustained-l2:dep-gh-pilot-001:gh-001:temperature_c:>:30";
    await confirmAlertFired(oldKey, new Date(), "dep-gh-pilot-001");
    await confirmAlertFired(currentKey, new Date(), "dep-gh-pilot-001");

    await clearAlertCooldown(currentKey, "dep-gh-pilot-001");

    expect(await canFireAlert(oldKey, 3600, Date.now(), "dep-gh-pilot-001")).toBe(false);
    expect(await canFireAlert(currentKey, 1, Date.now(), "dep-gh-pilot-001")).toBe(true);
  });

  it("throws on corrupt cooldown state instead of clearing it", async () => {
    writeFileSync(
      resolve(testDir, "deployments", "dep-gh-pilot-001", "alert-cooldown.json"),
      "{",
      "utf8",
    );

    await expect(canFireAlert("k", 60, Date.now(), "dep-gh-pilot-001")).rejects.toThrow();
  });

  it("reserveAlertCooldown prevents concurrent double-fire until confirm or release", async () => {
    const key = "dep-gh-pilot-001:gh-001:temperature_c:>:30";
    expect(await reserveAlertCooldown(key, 3600, Date.now(), "dep-gh-pilot-001")).toBe(true);
    expect(await reserveAlertCooldown(key, 3600, Date.now(), "dep-gh-pilot-001")).toBe(false);
    await releaseAlertReservation(key, "dep-gh-pilot-001");
    expect(await reserveAlertCooldown(key, 3600, Date.now(), "dep-gh-pilot-001")).toBe(true);
    await confirmAlertFired(key, new Date(), "dep-gh-pilot-001");
    expect(await canFireAlert(key, 3600, Date.now(), "dep-gh-pilot-001")).toBe(false);
  });

  it("throws on invalid cooldown schema instead of clearing it", async () => {
    writeFileSync(
      resolve(testDir, "deployments", "dep-gh-pilot-001", "alert-cooldown.json"),
      JSON.stringify({ last_fired: [] }),
      "utf8",
    );

    await expect(canFireAlert("k", 60, Date.now(), "dep-gh-pilot-001")).rejects.toThrow(
      /last_fired/,
    );
  });

  it("treats invalid last_fired timestamps as expired cooldown", async () => {
    writeFileSync(
      resolve(testDir, "deployments", "dep-gh-pilot-001", "alert-cooldown.json"),
      JSON.stringify({ last_fired: { "bad-key": "not-a-timestamp" } }),
      "utf8",
    );

    expect(await canFireAlert("bad-key", 3600, Date.now(), "dep-gh-pilot-001")).toBe(true);
  });

  it("confirmAlertFiredResilient honors cooldown after successful send path", async () => {
    const key = "dep-gh-pilot-001:gh-001:temperature_c:>:30";
    expect(await reserveAlertCooldown(key, 3600, Date.now(), "dep-gh-pilot-001")).toBe(true);
    await confirmAlertFiredResilient(key, new Date(), "dep-gh-pilot-001");
    expect(await canFireAlert(key, 3600, Date.now(), "dep-gh-pilot-001")).toBe(false);
  });

  it("throws when ALERT_COOLDOWN_RESERVATION_TTL_SECONDS is invalid", async () => {
    process.env.ALERT_COOLDOWN_RESERVATION_TTL_SECONDS = "not-a-number";
    await expect(reserveAlertCooldown("k", 60, Date.now(), "dep-gh-pilot-001")).rejects.toThrow(
      /ALERT_COOLDOWN_RESERVATION_TTL_SECONDS/,
    );
    delete process.env.ALERT_COOLDOWN_RESERVATION_TTL_SECONDS;
  });
});
