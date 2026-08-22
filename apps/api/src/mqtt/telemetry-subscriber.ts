import mqtt, { type MqttClient } from "mqtt";
import {
  createLogger,
  nodeHeartbeatSubscription,
  nodeTelemetrySubscription,
} from "@embodied-agent/platform";
import { handleTelemetryMessage } from "./handle-telemetry-message.js";
import { getEffectiveSettings } from "../settings/store.js";
import { mqttConnectOptions } from "./connect-options.js";

const log = createLogger("mqtt-telemetry-subscriber");

export class MqttTelemetrySubscriber {
  private client: MqttClient | null = null;

  constructor(private readonly brokerUrl: string) {}

  telemetryTopic(): string {
    return nodeTelemetrySubscription(getEffectiveSettings().deployment_id);
  }

  heartbeatTopic(): string {
    return nodeHeartbeatSubscription(getEffectiveSettings().deployment_id);
  }

  async connect(): Promise<void> {
    if (this.client) return;
    this.client = mqtt.connect(this.brokerUrl, mqttConnectOptions(this.brokerUrl));
    try {
      await new Promise<void>((resolve, reject) => {
        this.client!.once("connect", () => resolve());
        this.client!.once("error", reject);
      });
      this.client.on("offline", () => log.warn("mqtt client offline", { broker: this.brokerUrl }));
      this.client.on("reconnect", () =>
        log.info("mqtt client reconnecting", { broker: this.brokerUrl }),
      );
      const telemetryTopic = this.telemetryTopic();
      const heartbeatTopic = this.heartbeatTopic();
      await new Promise<void>((resolve, reject) => {
        this.client!.subscribe([telemetryTopic, heartbeatTopic], (err) =>
          err ? reject(err) : resolve(),
        );
      });
      this.client.on("message", (t, buf) => {
        try {
          const payload = JSON.parse(buf.toString("utf8")) as unknown;
          handleTelemetryMessage(t, payload);
        } catch (e) {
          log.warn("malformed mqtt payload", {
            topic: t,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      });
      log.info("subscribed", { telemetryTopic, heartbeatTopic });
    } catch (err) {
      await this.disconnect();
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.client?.end(false, {}, () => resolve());
    });
    this.client = null;
  }
}
