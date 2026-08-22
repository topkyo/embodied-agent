import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import { issueNodeToken } from "@embodied-agent/node";
import { handleTelemetryMessage } from "./handle-telemetry-message.js";
import { getIngestedTelemetry, resetTelemetryCacheForTests } from "../telemetry/store.js";
import { saveSettings } from "../settings/store.js";

let testDir: string;

describe("handleTelemetryMessage", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("mqtt-telemetry");
    process.env.DEPLOYMENT_ID = "dep-gh-pilot-001";
    process.env.ACTIVE_DOMAIN = "agriculture";
    seedCanonicalSimRegistry();
    resetTelemetryCacheForTests();
  });

  afterEach(() => {
    delete process.env.DEPLOYMENT_ID;
    delete process.env.ACTIVE_DOMAIN;
    releaseAgentDataDir(testDir);
  });

  it("drops telemetry with invalid node_token", () => {
    issueNodeToken("dep-gh-pilot-001", "node-sim-gh-001");
    const topic = "deployments/dep-gh-pilot-001/nodes/node-sim-gh-001/telemetry";
    const result = handleTelemetryMessage(topic, {
      node_id: "node-sim-gh-001",
      node_token: "bad",
      readings: [{ device_id: "sensor-sim-gh-001", metric: "temperature_c", value: 28 }],
    });
    expect(result).toEqual({ kind: "auth_drop", node_id: "node-sim-gh-001" });
    expect(getIngestedTelemetry()).toHaveLength(0);
  });

  it("drops telemetry when node has no registered token", () => {
    const topic = "deployments/dep-gh-pilot-001/nodes/node-sim-gh-001/telemetry";
    const result = handleTelemetryMessage(topic, {
      node_id: "node-sim-gh-001",
      node_token: "node-unregistered",
      readings: [{ device_id: "sensor-sim-gh-001", metric: "temperature_c", value: 28 }],
    });
    expect(result).toEqual({ kind: "auth_drop", node_id: "node-sim-gh-001" });
    expect(getIngestedTelemetry()).toHaveLength(0);
  });

  it("drops heartbeat missing node_token for registered node", () => {
    issueNodeToken("dep-gh-pilot-001", "node-sim-gh-001");
    const topic = "deployments/dep-gh-pilot-001/nodes/node-sim-gh-001/heartbeat";
    const result = handleTelemetryMessage(topic, {
      node_id: "node-sim-gh-001",
      config_version: 3,
      timestamp: new Date().toISOString(),
    });
    expect(result).toEqual({ kind: "auth_drop", node_id: "node-sim-gh-001" });
  });

  it("ignores telemetry payloads whose deployment_id does not match the topic", () => {
    const token = issueNodeToken("dep-gh-pilot-001", "node-sim-gh-001");
    const topic = "deployments/dep-gh-pilot-001/nodes/node-sim-gh-001/telemetry";
    const result = handleTelemetryMessage(topic, {
      deployment_id: "dep-other",
      node_id: "node-sim-gh-001",
      node_token: token,
      readings: [{ device_id: "sensor-sim-gh-001", metric: "temperature_c", value: 28 }],
    });
    expect(result).toEqual({ kind: "ignored" });
    expect(getIngestedTelemetry()).toHaveLength(0);
  });

  it("ingests valid telemetry", () => {
    const token = issueNodeToken("dep-gh-pilot-001", "node-sim-gh-001");
    const topic = "deployments/dep-gh-pilot-001/nodes/node-sim-gh-001/telemetry";
    const result = handleTelemetryMessage(topic, {
      node_id: "node-sim-gh-001",
      node_token: token,
      readings: [
        { device_id: "sensor-sim-gh-001", metric: "temperature_c", value: 28 },
        { device_id: "sensor-sim-gh-001", metric: "humidity_percent", value: 70 },
      ],
    });
    expect(result).toEqual({ kind: "telemetry" });
    expect(getIngestedTelemetry()).toHaveLength(1);
  });

  it("ignores telemetry topics outside the active deployment", () => {
    saveSettings({ deployment_id: "dep-robot-pilot-001", active_domain: "agriculture" });
    resetTelemetryCacheForTests("dep-gh-pilot-001");
    resetTelemetryCacheForTests("dep-robot-pilot-001");
    const token = issueNodeToken("dep-gh-pilot-001", "node-sim-gh-001");
    const topic = "deployments/dep-gh-pilot-001/nodes/node-sim-gh-001/telemetry";
    const result = handleTelemetryMessage(topic, {
      node_id: "node-sim-gh-001",
      node_token: token,
      readings: [
        { device_id: "sensor-sim-gh-001", metric: "temperature_c", value: 28 },
        { device_id: "sensor-sim-gh-001", metric: "humidity_percent", value: 70 },
      ],
    });
    expect(result).toEqual({ kind: "ignored" });
    expect(getIngestedTelemetry("dep-robot-pilot-001")).toHaveLength(0);
    expect(getIngestedTelemetry("dep-gh-pilot-001")).toHaveLength(0);
  });

  it("ingests heartbeat and records config version", () => {
    const token = issueNodeToken("dep-gh-pilot-001", "node-sim-gh-001");
    const topic = "deployments/dep-gh-pilot-001/nodes/node-sim-gh-001/heartbeat";
    const result = handleTelemetryMessage(topic, {
      node_id: "node-sim-gh-001",
      node_token: token,
      config_version: 3,
      timestamp: new Date().toISOString(),
    });
    expect(result).toEqual({ kind: "heartbeat", node_id: "node-sim-gh-001" });
  });
});
