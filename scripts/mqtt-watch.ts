#!/usr/bin/env tsx
/**
 * 订阅 nodes 相关 MQTT topic，供 tmux 监控面板使用。
 * 不依赖本机 mosquitto_sub；broker 可以是 docker mosquitto 或 aedes。
 */
import mqtt from "mqtt";

const url = process.env.MQTT_URL ?? "mqtt://127.0.0.1:1883";
const topic = process.env.MQTT_WATCH_TOPIC ?? "deployments/+/nodes/+/#";

const client = mqtt.connect(url);

client.on("connect", () => {
  console.log(`[mqtt-watch] connected ${url}`);
  client.subscribe(topic, (err) => {
    if (err) {
      console.error("[mqtt-watch] subscribe failed:", err.message);
      process.exit(1);
    }
    console.log(`[mqtt-watch] watching ${topic}`);
  });
});

client.on("message", (t, buf) => {
  console.log(t, buf.toString());
});

client.on("error", (err) => {
  console.error("[mqtt-watch] error:", err.message);
  process.exit(1);
});
