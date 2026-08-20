import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { upsertTelemetry } from "../telemetry/store.js";
import { captureTelemetrySnapshot } from "./telemetry-snapshot.js";

let testDir: string;

describe("telemetry-snapshot", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("telemetry-snapshot");
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("captures greenhouse readings", () => {
    upsertTelemetry([
      {
        entity_id: "gh-001",
        temperature_c: 28.5,
        humidity_percent: 72,
        vent_status: "open",
        fan_status: "off",
      },
    ]);
    const snap = captureTelemetrySnapshot("gh-001", "dep-gh-pilot-001");
    expect(snap?.temperature_c).toBe(28.5);
    expect(snap?.entity_id).toBe("gh-001");
  });
});
