import { afterEach, describe, expect, it } from "vitest";

import { MqttCommandPublisher, resolvePublishTimeoutMs } from "./client.js";
import { createMqttContext } from "./context.js";

describe("resolvePublishTimeoutMs", () => {
  const original = process.env.MQTT_PUBLISH_TIMEOUT_MS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.MQTT_PUBLISH_TIMEOUT_MS;
    } else {
      process.env.MQTT_PUBLISH_TIMEOUT_MS = original;
    }
  });

  it("env 非数字时回退默认 5000，避免 setTimeout(NaN) 秒超时", () => {
    process.env.MQTT_PUBLISH_TIMEOUT_MS = "abc";
    expect(resolvePublishTimeoutMs()).toBe(5000);
  });

  it("env 为空串 / 0 / 负数时回退默认", () => {
    expect(resolvePublishTimeoutMs("")).toBe(5000);
    expect(resolvePublishTimeoutMs("0")).toBe(5000);
    expect(resolvePublishTimeoutMs("-100")).toBe(5000);
  });

  it("env 缺省时用默认，合法值（含空白）被采用", () => {
    delete process.env.MQTT_PUBLISH_TIMEOUT_MS;
    expect(resolvePublishTimeoutMs()).toBe(5000);
    expect(resolvePublishTimeoutMs(" 8000 ")).toBe(8000);
  });
});

describe("MqttContext", () => {
  it("同一 url 返回同一实例，不同 url 返回新实例", () => {
    const ctx = createMqttContext();
    const a = ctx.publisher.get("mqtt://localhost:1883");
    const b = ctx.publisher.get("mqtt://localhost:1883");
    expect(a).toBe(b);

    const c = ctx.publisher.get("mqtt://other:1883");
    expect(c).not.toBe(a);
  });

  it("reset 后再次 get 创建新实例", () => {
    const ctx = createMqttContext();
    const before = ctx.publisher.get("mqtt://localhost:1883");
    ctx.publisher.reset();
    const after = ctx.publisher.get("mqtt://localhost:1883");
    expect(after).not.toBe(before);
  });

  it("reset 后 status 返回 null，get 后 status 反映 broker_url", () => {
    const ctx = createMqttContext();
    expect(ctx.publisher.status()).toBeNull();
    ctx.publisher.get("mqtt://localhost:1883");
    expect(ctx.publisher.status()).toEqual({
      broker_url: "mqtt://localhost:1883",
      connected: false,
      last_error: null,
    });
    ctx.publisher.reset();
    expect(ctx.publisher.status()).toBeNull();
  });

  it("每个 createMqttContext 实例独立持有 publisher", () => {
    const a = createMqttContext();
    const b = createMqttContext();
    const pubA = a.publisher.get("mqtt://localhost:1883");
    const pubB = b.publisher.get("mqtt://localhost:1883");
    expect(pubA).not.toBe(pubB);
  });
});

describe("MqttCommandPublisher lifecycle", () => {
  it("disconnect 在未连接时立即返回，不悬挂", async () => {
    const publisher = new MqttCommandPublisher("mqtt://localhost:1883");
    await expect(
      Promise.race([
        publisher.disconnect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("hang")), 500)),
      ]),
    ).resolves.toBeUndefined();
  });

  it("并发 connect 共享同一 Promise，不会互相 end 掉等待中的 client", async () => {
    const publisher = new MqttCommandPublisher("mqtt://127.0.0.1:1");
    const first = publisher.connect();
    const second = publisher.connect();
    // 无 broker 可连：两个调用都应以 error 收场（而非永久悬挂）
    const results = await Promise.allSettled([first, second]);
    for (const r of results) {
      expect(r.status).toBe("rejected");
    }
  }, 15000);
});
