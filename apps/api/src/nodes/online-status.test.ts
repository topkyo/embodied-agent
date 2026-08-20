import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { ingestHeartbeatMessage, resetTelemetryCacheForTests } from "../telemetry/store.js";
import { getNodeRuntimeStatus } from "./online-status.js";

let testDir: string;

describe("getNodeRuntimeStatus", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    resetTelemetryCacheForTests();
  });
  afterEach(() => {
    delete process.env.DEVICE_HEARTBEAT_TIMEOUT_MS;
    releaseAgentDataDir(testDir);
  });

  it("returns offline when no heartbeat was ingested", () => {
    expect(getNodeRuntimeStatus("node-sim-gh-002")).toEqual({
      online: false,
      reported_at: null,
    });
  });

  it("returns online for fresh heartbeat", () => {
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
    const status = getNodeRuntimeStatus("node-sim-gh-001");
    expect(status.online).toBe(true);
    expect(status.reported_at).toBeTruthy();
  });

  it("returns offline when heartbeat exceeds timeout", () => {
    process.env.DEVICE_HEARTBEAT_TIMEOUT_MS = "1000";
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
    const status = getNodeRuntimeStatus("node-sim-gh-001", Date.now() + 2000);
    expect(status.online).toBe(false);
  });
});
