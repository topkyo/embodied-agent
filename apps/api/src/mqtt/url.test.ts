import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidMqttUrl, resolveConfiguredMqttUrl } from "./url.js";

/** settings/store 的 env 兜底（DEFAULTS）在模块加载时冻结，改 env 后须重载模块才生效。 */
async function loadResolverWithCurrentEnv(): Promise<typeof resolveConfiguredMqttUrl> {
  vi.resetModules();
  const mod = await import("./url.js");
  return mod.resolveConfiguredMqttUrl;
}

describe("isValidMqttUrl", () => {
  it("accepts mqtt/mqtts/ws/wss URLs with host", () => {
    expect(isValidMqttUrl("mqtt://127.0.0.1:1883")).toBe(true);
    expect(isValidMqttUrl("mqtts://broker.example:8883")).toBe(true);
    expect(isValidMqttUrl("ws://broker.example/mqtt")).toBe(true);
    expect(isValidMqttUrl("wss://broker.example/mqtt")).toBe(true);
  });

  it("rejects empty, malformed, and wrong-scheme values", () => {
    expect(isValidMqttUrl("")).toBe(false);
    expect(isValidMqttUrl("   ")).toBe(false);
    expect(isValidMqttUrl("bad")).toBe(false);
    expect(isValidMqttUrl("http://broker.example")).toBe(false);
    expect(isValidMqttUrl("mqtt://")).toBe(false);
  });
});

describe("resolveConfiguredMqttUrl", () => {
  let savedEnv: NodeJS.ProcessEnv;
  let tempDataDir = "";

  beforeEach(() => {
    savedEnv = { ...process.env };
    tempDataDir = mkdtempSync(join(tmpdir(), "mqtt-url-test-"));
    process.env.AGENT_DATA_DIR = tempDataDir;
    process.env.DEPLOYMENT_ID = "dep-mqtt-url-test";
    process.env.ACTIVE_DOMAIN = "agriculture";
    delete process.env.MQTT_URL;
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    rmSync(tempDataDir, { recursive: true, force: true });
  });

  it("accepts mqtt:// and mqtts:// values", () => {
    expect(resolveConfiguredMqttUrl("mqtt://127.0.0.1:1883")).toBe("mqtt://127.0.0.1:1883");
    expect(resolveConfiguredMqttUrl("mqtts://broker.example:8883")).toBe(
      "mqtts://broker.example:8883",
    );
  });

  it("throws for invalid configured values", () => {
    expect(() => resolveConfiguredMqttUrl("http://broker.example")).toThrow(/mqtt_url 无效/);
    expect(() => resolveConfiguredMqttUrl("not-a-url")).toThrow(/mqtt_url 无效/);
  });

  it("redacts credentials in the invalid-url error message", () => {
    let message = "";
    try {
      resolveConfiguredMqttUrl("http://user:secret-pass@broker.example");
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain("//***@broker.example");
    expect(message).not.toContain("secret-pass");
  });

  it("prefers settings.mqtt_url over MQTT_URL env (settings-first semantics)", async () => {
    writeFileSync(
      join(tempDataDir, "settings.json"),
      JSON.stringify({ mqtt_url: "mqtt://settings.example:1883" }),
    );
    process.env.MQTT_URL = "mqtt://env.example:1883";
    const resolve = await loadResolverWithCurrentEnv();
    expect(resolve()).toBe("mqtt://settings.example:1883");
  });

  it("falls back to MQTT_URL env when settings omit mqtt_url", async () => {
    process.env.MQTT_URL = "mqtt://env.example:1883";
    const resolve = await loadResolverWithCurrentEnv();
    expect(resolve()).toBe("mqtt://env.example:1883");
  });

  it("returns undefined when explicit/env/settings are all missing", async () => {
    const resolve = await loadResolverWithCurrentEnv();
    expect(resolve()).toBeUndefined();
  });
});
