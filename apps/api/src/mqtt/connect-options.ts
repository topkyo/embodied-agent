import { mqttConnectOptions as buildOptions } from "@embodied-agent/platform";
import type { IClientOptions } from "mqtt";

export function mqttConnectOptions(brokerUrl: string): IClientOptions {
  return buildOptions(brokerUrl);
}
