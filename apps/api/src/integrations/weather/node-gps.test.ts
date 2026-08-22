import { allocateAgentDataDir, releaseAgentDataDir } from "../../test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  clearNodeGpsCacheForTests,
  ingestNodeGpsFromHeartbeat,
  resolveNodeGpsCoordinates,
} from "./node-gps.js";
import { resolveDeploymentCoordinatesSync } from "./geo-locate.js";

let testDir: string;

describe("node-gps", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
  });
  afterEach(() => {
    clearNodeGpsCacheForTests();
    releaseAgentDataDir(testDir);
  });

  it("ingests gps from heartbeat payload", () => {
    const reported_at = new Date().toISOString();
    const ok = ingestNodeGpsFromHeartbeat({
      node_id: "node-sim-gh-001",
      reported_at,
      gps: { latitude: 31.91, longitude: 121.08, accuracy_m: 6, fix_quality: 2 },
    });
    expect(ok).toBe(true);
    const fix = resolveNodeGpsCoordinates();
    expect(fix?.node_id).toBe("node-sim-gh-001");
    expect(fix?.latitude).toBe(31.91);
    expect(fix?.accuracy_m).toBe(6);
  });

  it("ignores heartbeat without gps field", () => {
    ingestNodeGpsFromHeartbeat({ node_id: "node-sim-gh-001" });
    expect(resolveNodeGpsCoordinates()).toBeNull();
  });

  it("resolves node gps before ip cache in geo chain", () => {
    ingestNodeGpsFromHeartbeat({
      node_id: "node-sim-gh-001",
      reported_at: new Date().toISOString(),
      gps: { latitude: 31.91, longitude: 121.08, accuracy_m: 5 },
    });
    const coords = resolveDeploymentCoordinatesSync();
    expect(coords.source).toBe("node");
    expect(coords.node_id).toBe("node-sim-gh-001");
  });
});
