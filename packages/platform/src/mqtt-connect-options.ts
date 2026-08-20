import { readFileSync } from "node:fs";

export type MqttConnectOptions = {
  reconnectPeriod?: number;
  connectTimeout?: number;
  username?: string;
  password?: string;
  rejectUnauthorized?: boolean;
  ca?: Buffer;
};

export function mqttConnectOptions(brokerUrl: string): MqttConnectOptions {
  const username = process.env.MQTT_USERNAME?.trim();
  const password = process.env.MQTT_PASSWORD?.trim();
  const rejectUnauthorized = process.env.MQTT_REJECT_UNAUTHORIZED !== "0";
  const caFile = process.env.MQTT_CA_FILE?.trim();
  const ca = caFile ? readFileSync(caFile) : undefined;
  return {
    reconnectPeriod: 5000,
    connectTimeout: 10_000,
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
    ...(brokerUrl.startsWith("mqtts://")
      ? {
          rejectUnauthorized,
          ...(ca ? { ca } : {}),
        }
      : {}),
  };
}
