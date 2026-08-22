import { createMqttPublisherHolder, type MqttPublisherHolder } from "./client.js";

/**
 * MqttContext 显式承载 MQTT publisher holder，消除模块级全局 defaultHolder。
 * 由装配层（bootstrap / 脚本 runtime）创建一次，显式注入到路由、watcher、event subscriber、chat pipeline。
 */
export type MqttContext = {
  publisher: MqttPublisherHolder;
};

export function createMqttContext(): MqttContext {
  return { publisher: createMqttPublisherHolder() };
}
