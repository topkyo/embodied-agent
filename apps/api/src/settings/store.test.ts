import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";

import {
  clearEffectiveSettingsCacheForTest,
  getEffectiveSettings,
  saveSettings,
  maskApiKey,
  toPublicSettings,
} from "./store.js";

let testDir: string;
let savedNodeEnv: string | undefined;

describe("settings store", () => {
  beforeEach(() => {
    clearEffectiveSettingsCacheForTest();
    savedNodeEnv = process.env.NODE_ENV;
    testDir = allocateAgentDataDir("test");
  });
  afterEach(() => {
    clearEffectiveSettingsCacheForTest();
    if (savedNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNodeEnv;
    }
    delete process.env.AGENT_SECRETS_KEY;
    delete process.env.DEPLOYMENT_ID;
    delete process.env.ACTIVE_DOMAIN;
    delete process.env.LLM_PROVIDER;
    delete process.env.STT_PROVIDER;
    releaseAgentDataDir(testDir);
  });

  it("masks api key", () => {
    expect(maskApiKey("sk-abcdef1234")).toBe("*********1234");
  });

  it("reports missing coordinates without builtin defaults", () => {
    saveSettings({ deployment_id: "dep-test-001", active_domain: "agriculture" });
    const pub = toPublicSettings(getEffectiveSettings());
    expect(pub.geo_coordinates_set).toBe(false);
    expect(pub.geo_latitude).toBeUndefined();
    expect(pub.geo_longitude).toBeUndefined();
    expect(pub.geo_coordinates_error).toMatch(/coordinates/);
    expect(pub.weather_proactive_enabled).not.toBe(false);
  });

  it("persists and loads settings", () => {
    saveSettings({
      deployment_id: "dep-test-002",
      active_domain: "agriculture",
      deployment_name: "测试部署",
      llm_api_key: "sk-test-key",
    });
    const s = getEffectiveSettings();
    expect(s.deployment_id).toBe("dep-test-002");
    expect(s.llm_api_key).toBe("sk-test-key");
    const pub = toPublicSettings(s);
    expect(pub.llm_api_key_set).toBe(true);
    expect(pub.llm_api_key_masked).toBeDefined();
  });

  it("invalidates in-memory cache after save", () => {
    saveSettings({
      deployment_id: "dep-cache-001",
      active_domain: "agriculture",
      deployment_name: "缓存前",
    });
    expect(getEffectiveSettings().deployment_name).toBe("缓存前");
    saveSettings({ deployment_name: "缓存失效后" });
    expect(getEffectiveSettings().deployment_name).toBe("缓存失效后");
  });

  it("public settings only expose active domain config", () => {
    const s = saveSettings({
      deployment_id: "dep-test-002",
      active_domain: "agriculture",
      domain_configs: {
        agriculture: { digest: true },
        robotics: { m20_base_url: "http://127.0.0.1:3099" },
      },
    });
    expect(s.domain_configs).toEqual({
      agriculture: { digest: true },
    });
    expect(toPublicSettings(s).domain_configs).toEqual({
      agriculture: { digest: true },
    });
  });

  it("clears inactive domain config when active_domain changes", () => {
    saveSettings({
      deployment_id: "dep-test-002",
      active_domain: "agriculture",
      domain_configs: {
        agriculture: { digest: true },
      },
    });
    const s = saveSettings({
      active_domain: "robotics",
    });
    expect(s.domain_configs).toEqual({ robotics: {} });
  });

  it("throws when active_domain is empty", () => {
    expect(() => saveSettings({ deployment_id: "dep-test-001", active_domain: "" })).toThrow(
      /active_domain/,
    );
  });

  it("throws when llm_provider is explicitly unknown", () => {
    expect(() =>
      saveSettings({
        deployment_id: "dep-test-001",
        active_domain: "agriculture",
        llm_provider: "unknown" as never,
      }),
    ).toThrow(/未知 LLM_PROVIDER/);
  });

  it("throws when stt_provider is explicitly unknown", () => {
    expect(() =>
      saveSettings({
        deployment_id: "dep-test-001",
        active_domain: "agriculture",
        stt_provider: "unknown" as never,
      }),
    ).toThrow(/未知 STT_PROVIDER/);
  });

  it("uses ACTIVE_DOMAIN env when settings file is unset", () => {
    rmSync(join(testDir, "settings.json"), { force: true });
    process.env.ACTIVE_DOMAIN = "agriculture";
    process.env.DEPLOYMENT_ID = "dep-test-001";
    expect(getEffectiveSettings().active_domain).toBe("agriculture");
  });

  it("rejects ACTIVE_DOMAIN with multiple scene ids", () => {
    rmSync(join(testDir, "settings.json"), { force: true });
    process.env.ACTIVE_DOMAIN = "agriculture,robotics";
    process.env.DEPLOYMENT_ID = "dep-test-001";
    expect(() => getEffectiveSettings()).toThrow(/只允许配置一个/);
  });

  it("throws when deployment_id is missing", () => {
    rmSync(join(testDir, "settings.json"), { force: true });
    delete process.env.DEPLOYMENT_ID;
    expect(() => getEffectiveSettings()).toThrow(/deployment_id/);
  });

  it("does not default mqtt_url when unset", () => {
    rmSync(join(testDir, "settings.json"), { force: true });
    process.env.DEPLOYMENT_ID = "dep-test-001";
    process.env.ACTIVE_DOMAIN = "agriculture";
    delete process.env.MQTT_URL;
    expect(getEffectiveSettings().mqtt_url).toBe("");
  });

  it("throws when active_domain is missing", () => {
    rmSync(join(testDir, "settings.json"), { force: true });
    process.env.DEPLOYMENT_ID = "dep-test-001";
    delete process.env.ACTIVE_DOMAIN;
    expect(() => getEffectiveSettings()).toThrow(/active_domain/);
  });

  it("allows production active_domain from env", () => {
    rmSync(join(testDir, "settings.json"), { force: true });
    process.env.NODE_ENV = "production";
    process.env.DEPLOYMENT_ID = "dep-test-001";
    process.env.ACTIVE_DOMAIN = "agriculture";
    expect(getEffectiveSettings().active_domain).toBe("agriculture");
  });

  it("allows dev deployment_id from env", () => {
    rmSync(join(testDir, "settings.json"), { force: true });
    process.env.DEPLOYMENT_ID = "dep-test-001";
    process.env.ACTIVE_DOMAIN = "agriculture";
    expect(getEffectiveSettings().deployment_id).toBe("dep-test-001");
  });

  it("throws when settings.json and ACTIVE_DOMAIN env mismatch", () => {
    process.env.DEPLOYMENT_ID = "dep-test-001";
    process.env.ACTIVE_DOMAIN = "agriculture";
    saveSettings({ deployment_id: "dep-test-001", active_domain: "agriculture" });
    process.env.ACTIVE_DOMAIN = "robotics";
    expect(() => getEffectiveSettings()).toThrow(/配置真源冲突/);
  });

  it("rejects plaintext secrets in production without AGENT_SECRETS_KEY", () => {
    process.env.NODE_ENV = "production";
    delete process.env.AGENT_SECRETS_KEY;
    expect(() =>
      saveSettings({
        deployment_id: "dep-test-001",
        active_domain: "agriculture",
        llm_api_key: "sk-plain",
      }),
    ).toThrow(/AGENT_SECRETS_KEY/);
  });

  it("accepts when settings.json and ACTIVE_DOMAIN env are identical", () => {
    process.env.DEPLOYMENT_ID = "dep-test-001";
    process.env.ACTIVE_DOMAIN = "agriculture";
    saveSettings({ deployment_id: "dep-test-001", active_domain: "agriculture" });
    expect(getEffectiveSettings().active_domain).toBe("agriculture");
  });
});
