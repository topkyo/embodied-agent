import mqtt, { type MqttClient } from "mqtt";
import { nodeEventsSubscription } from "@embodied-agent/platform";
import { createLogger } from "@embodied-agent/platform";
import { handleEventMessage } from "./handle-event-message.js";
import { getEffectiveSettings } from "../settings/store.js";
import { mqttConnectOptions } from "./connect-options.js";
import type { MqttContext } from "@embodied-agent/node";

const log = createLogger("mqtt-event-subscriber");

export class MqttEventSubscriber {
  private client: MqttClient | null = null;

  constructor(
    private readonly brokerUrl: string,
    private readonly mqttCtx: MqttContext,
  ) {}

  eventsTopic(): string {
    return nodeEventsSubscription(getEffectiveSettings().deployment_id);
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
      const topic = this.eventsTopic();
      await new Promise<void>((resolve, reject) => {
        this.client!.subscribe(topic, (err) => (err ? reject(err) : resolve()));
      });
      this.client.on("message", (t, buf) => {
        try {
          const raw = JSON.parse(buf.toString("utf8")) as unknown;
          handleEventMessage(this.mqttCtx, t, raw);
        } catch (e) {
          log.warn("malformed mqtt event payload", {
            topic: t,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      });
      log.info("subscribed", { topic });
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
