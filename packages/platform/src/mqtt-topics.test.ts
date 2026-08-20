import { describe, expect, it } from "vitest";
import {
  nodeCommandTopic,
  nodeEventsSubscription,
  nodeHeartbeatSubscription,
  nodeTelemetrySubscription,
  parseDeploymentIdFromMqttTopic,
  parseNodeScopedMqttTopic,
  pairingInstallCodeTopic,
} from "./mqtt-topics.js";

describe("mqtt-topics", () => {
  it("builds deployment-scoped command topic", () => {
    expect(nodeCommandTopic("dep-gh-pilot-001", "node-sim-gh-001")).toBe(
      "deployments/dep-gh-pilot-001/nodes/node-sim-gh-001/commands",
    );
  });

  it("parses deployment id from topic", () => {
    expect(parseDeploymentIdFromMqttTopic("deployments/dep-gh-pilot-001/nodes/n1/telemetry")).toBe(
      "dep-gh-pilot-001",
    );
    expect(parseDeploymentIdFromMqttTopic("farms/dep-gh-pilot-001/nodes/n1/telemetry")).toBe(null);
  });

  it("exposes deployment-scoped subscriptions", () => {
    expect(nodeEventsSubscription("dep-001")).toBe("deployments/dep-001/nodes/+/events");
    expect(nodeTelemetrySubscription("dep-001")).toBe("deployments/dep-001/nodes/+/telemetry");
    expect(nodeHeartbeatSubscription("dep-001")).toBe("deployments/dep-001/nodes/+/heartbeat");
  });

  it("parses node scoped topics exactly", () => {
    expect(parseNodeScopedMqttTopic("deployments/dep-001/nodes/node-a/events")).toEqual({
      deployment_id: "dep-001",
      node_id: "node-a",
      kind: "events",
    });
    expect(parseNodeScopedMqttTopic("deployments/dep-001/nodes/node-a/commands")).toBeNull();
    expect(parseNodeScopedMqttTopic("deployments/dep-001/nodes/node-a/events/extra")).toBeNull();
  });

  it("builds pairing topic", () => {
    expect(pairingInstallCodeTopic("dep-001", "node-a")).toBe(
      "deployments/dep-001/pairing/node-a/install_code",
    );
  });
});
