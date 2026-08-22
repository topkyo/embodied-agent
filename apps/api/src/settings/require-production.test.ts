import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { encryptSecret } from "@embodied-agent/platform";
import { requireProductionSecrets } from "./require-production.js";

describe("requireProductionSecrets", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("skips in non-production", () => {
    process.env.NODE_ENV = "development";
    delete process.env.ADMIN_TOKEN;
    expect(() => requireProductionSecrets()).not.toThrow();
  });

  it("rejects missing ADMIN_TOKEN in production", () => {
    process.env.NODE_ENV = "production";
    process.env.METRICS_ALLOW_PUBLIC = "1";
    delete process.env.ADMIN_TOKEN;
    expect(() => requireProductionSecrets()).toThrow(/ADMIN_TOKEN/);
  });

  it("rejects dev-admin in production", () => {
    process.env.NODE_ENV = "production";
    process.env.METRICS_ALLOW_PUBLIC = "1";
    process.env.ADMIN_TOKEN = "dev-admin";
    expect(() => requireProductionSecrets()).toThrow(/dev-admin/);
  });

  it("allows explicit strong token in production", () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_TOKEN = "pilot-secret-token";
    process.env.METRICS_ALLOW_PUBLIC = "1";
    const dataDir = mkdtempSync(join(tmpdir(), "prod-secrets-ok-"));
    process.env.AGENT_DATA_DIR = dataDir;
    writeFileSync(join(dataDir, "settings.json"), JSON.stringify({ deployment_id: "dep-test" }));
    expect(() => requireProductionSecrets()).not.toThrow();
  });

  it("rejects production without metrics policy", () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_TOKEN = "pilot-secret-token";
    delete process.env.METRICS_SCRAPE_TOKEN;
    delete process.env.METRICS_ALLOW_PUBLIC;
    const dataDir = mkdtempSync(join(tmpdir(), "prod-metrics-"));
    process.env.AGENT_DATA_DIR = dataDir;
    writeFileSync(join(dataDir, "settings.json"), JSON.stringify({ deployment_id: "dep-test" }));
    expect(() => requireProductionSecrets()).toThrow(/METRICS_SCRAPE_TOKEN|METRICS_ALLOW_PUBLIC/);
  });

  it("allows production with METRICS_SCRAPE_TOKEN", () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_TOKEN = "pilot-secret-token";
    process.env.METRICS_SCRAPE_TOKEN = "scrape-secret";
    delete process.env.METRICS_ALLOW_PUBLIC;
    const dataDir = mkdtempSync(join(tmpdir(), "prod-metrics-token-"));
    process.env.AGENT_DATA_DIR = dataDir;
    writeFileSync(join(dataDir, "settings.json"), JSON.stringify({ deployment_id: "dep-test" }));
    expect(() => requireProductionSecrets()).not.toThrow();
  });

  it("allows encrypted secrets in settings.json when AGENT_SECRETS_KEY is set", () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_TOKEN = "pilot-secret-token";
    process.env.METRICS_ALLOW_PUBLIC = "1";
    process.env.AGENT_SECRETS_KEY = "prod-at-rest-key";
    const dataDir = mkdtempSync(join(tmpdir(), "prod-secrets-enc-"));
    process.env.AGENT_DATA_DIR = dataDir;
    writeFileSync(
      join(dataDir, "settings.json"),
      JSON.stringify({
        deployment_id: "dep-test",
        llm_api_key: encryptSecret("sk-encrypted", "prod-at-rest-key"),
      }),
    );
    expect(() => requireProductionSecrets()).not.toThrow();
  });

  it("rejects plaintext secrets in settings.json without AGENT_SECRETS_KEY", () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_TOKEN = "pilot-secret-token";
    process.env.METRICS_ALLOW_PUBLIC = "1";
    delete process.env.AGENT_SECRETS_KEY;
    const dataDir = mkdtempSync(join(tmpdir(), "prod-secrets-bad-"));
    process.env.AGENT_DATA_DIR = dataDir;
    writeFileSync(
      join(dataDir, "settings.json"),
      JSON.stringify({ deployment_id: "dep-test", llm_api_key: "sk-plain" }),
    );
    expect(() => requireProductionSecrets()).toThrow(/settings\.json/);
  });

  it("rejects FILE_LOCK_STALE_MS shorter than matrix timeout", () => {
    process.env.NODE_ENV = "development";
    process.env.FILE_LOCK_STALE_MS = "1000";
    process.env.INTENT_PROMOTE_MATRIX_TIMEOUT_MS = "600000";
    expect(() => requireProductionSecrets()).toThrow(/FILE_LOCK_STALE_MS/);
  });

  it("rejects REDIS_LOCK_TTL_MS shorter than matrix timeout", () => {
    process.env.NODE_ENV = "development";
    process.env.REDIS_LOCK_TTL_MS = "1000";
    process.env.INTENT_PROMOTE_MATRIX_TIMEOUT_MS = "600000";
    expect(() => requireProductionSecrets()).toThrow(/REDIS_LOCK_TTL_MS/);
  });

  it("rejects plaintext node tokens in production without AGENT_SECRETS_KEY", () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_TOKEN = "pilot-secret-token";
    process.env.METRICS_ALLOW_PUBLIC = "1";
    delete process.env.AGENT_SECRETS_KEY;
    const dataDir = mkdtempSync(join(tmpdir(), "prod-node-tokens-"));
    process.env.AGENT_DATA_DIR = dataDir;
    writeFileSync(join(dataDir, "settings.json"), JSON.stringify({ deployment_id: "dep-test" }));
    const depDir = join(dataDir, "deployments", "dep-test");
    mkdirSync(depDir, { recursive: true });
    writeFileSync(
      join(depDir, "node-tokens.json"),
      JSON.stringify({
        tokens: [
          {
            deployment_id: "dep-test",
            node_id: "node-a",
            token: "node_plaintext",
            issued_at: new Date().toISOString(),
          },
        ],
      }),
    );
    expect(() => requireProductionSecrets()).toThrow(/node-tokens\.json/);
  });
});
