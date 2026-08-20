import mqtt, { type MqttClient } from "mqtt";
import { commandMessageSchema, type CommandMessage } from "@embodied-agent/core";
import {
  mqttConnectOptions,
  nodeCommandTopic,
  nodeConfigTopic,
  pairingInstallCodeTopic,
} from "@embodied-agent/platform";

const DEFAULT_PUBLISH_TIMEOUT_MS = 5_000;

/** 解析 MQTT_PUBLISH_TIMEOUT_MS；非法值（非数字/非正数）回退默认，避免 setTimeout(NaN) 立即超时。 */
export function resolvePublishTimeoutMs(raw = process.env.MQTT_PUBLISH_TIMEOUT_MS): number {
  const n = Number(raw?.trim());
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PUBLISH_TIMEOUT_MS;
}

export class MqttCommandPublisher {
  private client: MqttClient | null = null;
  private connected = false;
  private lastError: string | null = null;
  /** 并发 connect 去重：否则后到的 connect 会 end(true) 掉前者等待中的 client，使其 Promise 永不 settle。 */
  private connectPromise: Promise<void> | null = null;

  constructor(
    private readonly brokerUrl: string,
    private readonly publishTimeoutMs = resolvePublishTimeoutMs(),
  ) {}

  async connect(): Promise<void> {
    // mqtt.js 自带 connected 为真源；重连成功后须同步，避免 once("connect") 后永久 false
    if (this.client?.connected) {
      this.connected = true;
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }
    this.connectPromise = this.doConnect();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private async doConnect(): Promise<void> {
    if (this.client) {
      this.client.end(true);
      this.client = null;
      this.connected = false;
    }
    const client = mqtt.connect(this.brokerUrl, mqttConnectOptions(this.brokerUrl));
    this.client = client;
    await new Promise<void>((resolve, reject) => {
      client.once("connect", () => {
        this.connected = true;
        this.lastError = null;
        resolve();
      });
      client.once("error", (err) => {
        this.connected = false;
        this.lastError = err instanceof Error ? err.message : String(err);
        if (this.client === client) this.client = null;
        client.end(true);
        reject(err);
      });
    });
    client.on("connect", () => {
      this.connected = true;
      this.lastError = null;
    });
    client.on("close", () => {
      this.connected = false;
    });
    client.on("offline", () => {
      this.connected = false;
    });
    client.on("error", (err) => {
      this.lastError = err instanceof Error ? err.message : String(err);
    });
  }

  async publishCommand(cmd: CommandMessage): Promise<void> {
    commandMessageSchema.parse(cmd);
    await this.connect();
    if (!cmd.node_id) {
      throw new Error("command 缺少 node_id，无法确定下发 topic");
    }
    const topic = nodeCommandTopic(cmd.deployment_id, cmd.node_id);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const message = `MQTT publish timed out after ${this.publishTimeoutMs}ms`;
        this.lastError = message;
        reject(new Error(message));
      }, this.publishTimeoutMs);
      this.client!.publish(topic, JSON.stringify(cmd), (err) => {
        clearTimeout(timeout);
        if (err) {
          this.lastError = err.message;
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 发布 node config 到 retained topic。
   * 绑定、更新设备、换实体时调用，节点订阅后收到最新配置并校验 config_version 应用。
   */
  /**
   * 向节点 pairing topic 下发一次性安装码（retained，节点订阅后自动 register）。
   */
  async publishPairingInstallCode(payload: {
    deployment_id: string;
    node_id: string;
    entity_id?: string;
    install_code: string;
    expires_at: string;
  }): Promise<void> {
    await this.connect();
    const topic = pairingInstallCodeTopic(payload.deployment_id, payload.node_id);
    const msg = {
      message_type: "pairing_install_code",
      protocol_version: "0.1",
      deployment_id: payload.deployment_id,
      node_id: payload.node_id,
      entity_id: payload.entity_id,
      install_code: payload.install_code,
      expires_at: payload.expires_at,
      issued_at: new Date().toISOString(),
    };
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const message = `MQTT pairing code publish timed out after ${this.publishTimeoutMs}ms`;
        this.lastError = message;
        reject(new Error(message));
      }, this.publishTimeoutMs);
      this.client!.publish(topic, JSON.stringify(msg), { retain: true, qos: 1 }, (err) => {
        clearTimeout(timeout);
        if (err) {
          this.lastError = err.message;
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async clearPairingInstallCode(deployment_id: string, node_id: string): Promise<void> {
    await this.connect();
    const topic = pairingInstallCodeTopic(deployment_id, node_id);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const message = `MQTT pairing code clear timed out after ${this.publishTimeoutMs}ms`;
        this.lastError = message;
        reject(new Error(message));
      }, this.publishTimeoutMs);
      this.client!.publish(topic, "", { retain: true, qos: 1 }, (err) => {
        clearTimeout(timeout);
        if (err) {
          this.lastError = err.message;
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async publishNodeConfig(payload: {
    deployment_id: string;
    node_id: string;
    config_version: number;
    status?: string;
    entity_id?: string;
    devices: Array<{
      device_id: string;
      device_type: string;
      channel?: string;
      metrics?: string[];
      actions?: string[];
      max_duration_seconds?: number;
    }>;
  }): Promise<void> {
    await this.connect();
    const topic = nodeConfigTopic(payload.deployment_id, payload.node_id);
    const msg = {
      message_type: "node_config",
      protocol_version: "0.1",
      deployment_id: payload.deployment_id,
      node_id: payload.node_id,
      entity_id: payload.entity_id,
      config_version: payload.config_version,
      status: payload.status ?? "active",
      devices: payload.devices,
    };
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const message = `MQTT retained config publish timed out after ${this.publishTimeoutMs}ms`;
        this.lastError = message;
        reject(new Error(message));
      }, this.publishTimeoutMs);
      // retained: true 关键
      this.client!.publish(topic, JSON.stringify(msg), { retain: true }, (err) => {
        clearTimeout(timeout);
        if (err) {
          this.lastError = err.message;
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  status(): { broker_url: string; connected: boolean; last_error: string | null } {
    const live = this.client?.connected === true;
    if (live) this.connected = true;
    return {
      broker_url: this.brokerUrl,
      connected: live || this.connected,
      last_error: this.lastError,
    };
  }

  async disconnect(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.connected = false;
    // client 为 null 时必须直接返回，否则 end 回调永不触发、await 永久悬挂。
    if (!client) return;
    await new Promise<void>((resolve) => {
      client.end(false, {}, () => resolve());
    });
  }
}

export type MqttPublisherHolder = {
  get(url: string): MqttCommandPublisher;
  status(): { broker_url: string; connected: boolean; last_error: string | null } | null;
  reset(): void;
};

export function createMqttPublisherHolder(): MqttPublisherHolder {
  let publisher: MqttCommandPublisher | null = null;
  let publisherUrl: string | null = null;

  return {
    get(url: string): MqttCommandPublisher {
      if (!publisher || publisherUrl !== url) {
        publisher = new MqttCommandPublisher(url);
        publisherUrl = url;
      }
      return publisher;
    },
    status() {
      return publisher?.status() ?? null;
    },
    reset() {
      publisher = null;
      publisherUrl = null;
    },
  };
}
