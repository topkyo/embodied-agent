import { allocateAgentDataDir, releaseAgentDataDir } from "./test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { buildApp } from "./app.js";
import { LlmUnavailableError } from "@embodied-agent/agent";
import { clearOperationLogs, listOperationLogs } from "./db/log.js";
import { clearCommands } from "./commands/store.js";
import { ingestHeartbeatMessage } from "./telemetry/store.js";
import { seedCanonicalSimRegistry } from "./test/registry-fixture.js";
import { seedDefaultUsers } from "./test/users-fixture.js";

let testDir: string;

const unavailableLlm = {
  async completeJson() {
    throw new LlmUnavailableError("LLM_API_KEY is not set");
  },
  async completeText() {
    throw new LlmUnavailableError("LLM_API_KEY is not set");
  },
};

describe("chat HTTP integration", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    testDir = allocateAgentDataDir("test");
    seedCanonicalSimRegistry();
    seedDefaultUsers();
    clearOperationLogs();
    clearCommands();
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
    delete process.env.LLM_API_KEY;
  });
  afterEach(() => {
    delete process.env.LLM_API_KEY;
    delete process.env.CHAT_CHANNEL;
    delete process.env.CORS_ORIGIN;
    delete process.env.NODE_ENV;
    delete process.env.ENABLE_DEV_CHAT;
    delete process.env.DEV_CHAT_SECRET;
    releaseAgentDataDir(testDir);
  });

  it("returns 503 when LLM is unavailable", async () => {
    const app = await buildApp({
      pipeline: {
        llmClient: unavailableLlm,
        model: "unavailable",
        mqttEnabled: false,
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/dev/chat",
      payload: {
        text: "1号棚现在多少度？",
        user_id: "owner-001",
        conversation_id: "dev-test-001",
      },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      reply: expect.stringContaining("暂不可用"),
    });
    expect(listOperationLogs()).toHaveLength(0);
    await app.close();
  });

  it("returns 404 for /dev/chat in production by default", async () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGIN = "http://localhost:5173";
    process.env.METRICS_ALLOW_PUBLIC = "1";
    process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim() || "pilot-secret-token";
    delete process.env.ENABLE_DEV_CHAT;
    const app = await buildApp({
      pipeline: {
        llmClient: unavailableLlm,
        model: "unavailable",
        mqttEnabled: false,
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/dev/chat",
      payload: {
        text: "1号棚现在多少度？",
        user_id: "owner-001",
        conversation_id: "dev-test-001",
      },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("rejects unsigned wechat-stub channel in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGIN = "http://localhost:5173";
    process.env.METRICS_ALLOW_PUBLIC = "1";
    process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim() || "pilot-secret-token";
    process.env.CHAT_CHANNEL = "wechat-stub";
    await expect(buildApp()).rejects.toThrow(/wechat-stub is dev-only/);
  });

  it("rejects wechat-stub channel when NODE_ENV is unset (fail-closed as production)", async () => {
    delete process.env.NODE_ENV;
    process.env.METRICS_ALLOW_PUBLIC = "1";
    process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim() || "pilot-secret-token";
    process.env.CHAT_CHANNEL = "wechat-stub";
    await expect(buildApp()).rejects.toThrow(/wechat-stub is dev-only/);
  });

  it("requires DEV_CHAT_SECRET for ENABLE_DEV_CHAT=1 when NODE_ENV is unset", async () => {
    delete process.env.NODE_ENV;
    process.env.METRICS_ALLOW_PUBLIC = "1";
    process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim() || "pilot-secret-token";
    process.env.ENABLE_DEV_CHAT = "1";
    delete process.env.DEV_CHAT_SECRET;
    await expect(buildApp()).rejects.toThrow(/requires DEV_CHAT_SECRET/);
  });

  it("rejects generic webhook when no channel is configured", async () => {
    const app = await buildApp({
      pipeline: {
        llmClient: unavailableLlm,
        model: "unavailable",
        mqttEnabled: false,
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/chat",
      payload: { text: "hello" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().reply).toContain("/integrations/chat");
    await app.close();
  });

  it("reflects allowlisted origin on OPTIONS preflight", async () => {
    process.env.CORS_ORIGIN = "http://localhost:5173";
    const app = await buildApp({
      pipeline: {
        llmClient: unavailableLlm,
        model: "unavailable",
        mqttEnabled: false,
      },
    });

    const res = await app.inject({
      method: "OPTIONS",
      url: "/health",
      headers: { origin: "http://localhost:5173" },
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-headers"]).toContain("x-admin-token");
    await app.close();
  });

  it("rejects production wildcard CORS_ORIGIN at startup", async () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGIN = "*";
    process.env.METRICS_ALLOW_PUBLIC = "1";
    process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim() || "pilot-secret-token";
    await expect(
      buildApp({
        pipeline: {
          llmClient: unavailableLlm,
          model: "unavailable",
          mqttEnabled: false,
        },
      }),
    ).rejects.toThrow(/must not be '\*'/);
  });
});
