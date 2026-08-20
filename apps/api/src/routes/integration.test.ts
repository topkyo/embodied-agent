import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

// Mock processChatMessage so we test route branching logic without calling the real LLM.
// resolveLlmFromSettings and type exports remain from the actual module.
vi.mock("../chat/pipeline.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../chat/pipeline.js")>();
  return { ...actual, processChatMessage: vi.fn() };
});

// Mock resolveInboundUtterance to avoid PlatformRuntimeContext dependency (getIntentResolver).
vi.mock("../chat/resolve-utterance.js", () => ({
  resolveInboundUtterance: vi.fn(async (input: { text?: string }) => ({
    text: input.text?.trim() ?? "",
    from_stt: false,
  })),
}));

import { processChatMessage, type ChatPipelineDeps } from "../chat/pipeline.js";
import { LlmUnavailableError } from "@embodied-agent/agent";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import { seedDefaultUsers } from "../test/users-fixture.js";
import { saveSettings } from "../settings/store.js";
import { upsertBinding } from "../auth/platform-bind.js";
import { registerIntegrationRoutes } from "./integration.js";

const mockedProcessChatMessage = vi.mocked(processChatMessage);
const TEST_SECRET = "test-integration-secret";
const minimalDeps = (): ChatPipelineDeps => ({}) as ChatPipelineDeps;

describe("POST /integrations/chat", () => {
  let testDir: string;
  let savedNodeEnv: string | undefined;
  let savedIntegrationSecret: string | undefined;
  let savedLlmApiKey: string | undefined;
  let savedDeploymentId: string | undefined;
  let savedActiveDomain: string | undefined;
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    savedNodeEnv = process.env.NODE_ENV;
    savedIntegrationSecret = process.env.INTEGRATION_SECRET;
    savedLlmApiKey = process.env.LLM_API_KEY;
    savedDeploymentId = process.env.DEPLOYMENT_ID;
    savedActiveDomain = process.env.ACTIVE_DOMAIN;
    testDir = allocateAgentDataDir("integration-route");
    seedCanonicalSimRegistry();
    seedDefaultUsers();
    process.env.NODE_ENV = "test";
    delete process.env.LLM_API_KEY;
    // saveSettings before setting INTEGRATION_SECRET env var so the secret
    // is not persisted into the settings file (keeps file secret-free for
    // tests that need to exercise the no-secret / dev-fallback path).
    saveSettings({ deployment_id: "dep-gh-pilot-001", active_domain: "agriculture" });
    process.env.INTEGRATION_SECRET = TEST_SECRET;
    mockedProcessChatMessage.mockReset();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
    if (savedIntegrationSecret === undefined) delete process.env.INTEGRATION_SECRET;
    else process.env.INTEGRATION_SECRET = savedIntegrationSecret;
    if (savedLlmApiKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = savedLlmApiKey;
    if (savedDeploymentId === undefined) delete process.env.DEPLOYMENT_ID;
    else process.env.DEPLOYMENT_ID = savedDeploymentId;
    if (savedActiveDomain === undefined) delete process.env.ACTIVE_DOMAIN;
    else process.env.ACTIVE_DOMAIN = savedActiveDomain;
    releaseAgentDataDir(testDir);
  });

  async function makeApp(): Promise<FastifyInstance> {
    const a = Fastify();
    await registerIntegrationRoutes(a, minimalDeps);
    return a;
  }

  it("returns 401 when no integration secret is configured and NODE_ENV is unset", async () => {
    delete process.env.INTEGRATION_SECRET;
    delete process.env.NODE_ENV;
    app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/integrations/chat",
      payload: { text: "你好", user_id: "wx_user", platform: "wechat" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ reply: "集成鉴权失败。" });
    expect(mockedProcessChatMessage).not.toHaveBeenCalled();
  });

  it("returns 401 when auth header is missing but secret is configured", async () => {
    app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/integrations/chat",
      payload: { text: "你好", user_id: "wx_user", platform: "wechat" },
    });
    expect(res.statusCode).toBe(401);
    expect(mockedProcessChatMessage).not.toHaveBeenCalled();
  });

  it("returns 401 with wrong bearer secret", async () => {
    app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/integrations/chat",
      headers: { authorization: "Bearer wrong-secret" },
      payload: { text: "你好", user_id: "wx_user", platform: "wechat" },
    });
    expect(res.statusCode).toBe(401);
    expect(mockedProcessChatMessage).not.toHaveBeenCalled();
  });

  it("allows dev-env fallback when no secret configured and NODE_ENV=test", async () => {
    delete process.env.INTEGRATION_SECRET;
    process.env.NODE_ENV = "test";
    app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/integrations/chat",
      headers: { authorization: "Bearer any-secret" },
      payload: { text: "你好", user_id: "wx_not_bound_999", platform: "wechat" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ reply: "尚未绑定账号，请联系安装人员。" });
  });

  it("returns 400 when user_id is missing (schema required)", async () => {
    app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/integrations/chat",
      headers: { authorization: `Bearer ${TEST_SECRET}` },
      payload: { text: "你好", platform: "wechat" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("user_id");
    expect(mockedProcessChatMessage).not.toHaveBeenCalled();
  });

  it("returns 200 with notBound reply when platform user is not bound", async () => {
    app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/integrations/chat",
      headers: { authorization: `Bearer ${TEST_SECRET}` },
      payload: { text: "你好", user_id: "wx_not_bound_999", platform: "wechat" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ reply: "尚未绑定账号，请联系安装人员。" });
    expect(mockedProcessChatMessage).not.toHaveBeenCalled();
  });

  it("returns 200 with needContent reply when user_id is empty after trim", async () => {
    app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/integrations/chat",
      headers: { authorization: `Bearer ${TEST_SECRET}` },
      payload: { text: "你好", user_id: "   ", platform: "wechat" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ reply: "请发送文字或语音。" });
    expect(mockedProcessChatMessage).not.toHaveBeenCalled();
  });

  it("returns 503 when pipeline throws LlmUnavailableError", async () => {
    upsertBinding("wechat", "wx_bound_owner", "owner-001");
    mockedProcessChatMessage.mockRejectedValueOnce(
      new LlmUnavailableError("LLM_API_KEY is not set"),
    );
    app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/integrations/chat",
      headers: { authorization: `Bearer ${TEST_SECRET}` },
      payload: { text: "1号棚现在多少度？", user_id: "wx_bound_owner", platform: "wechat" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ reply: "具身 Agent 暂不可用，请稍后再试。" });
    expect(mockedProcessChatMessage).toHaveBeenCalledOnce();
  });

  it("returns 400 when deployment_id does not match runtime", async () => {
    upsertBinding("wechat", "wx_bound_owner", "owner-001");
    app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/integrations/chat",
      headers: { authorization: `Bearer ${TEST_SECRET}` },
      payload: {
        text: "1号棚现在多少度？",
        user_id: "wx_bound_owner",
        platform: "wechat",
        deployment_id: "wrong-deployment-id",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ reply: expect.stringMatching(/deployment_id/) });
    expect(mockedProcessChatMessage).not.toHaveBeenCalled();
  });

  it("returns 200 with reply and command metadata on correct request", async () => {
    upsertBinding("wechat", "wx_bound_owner", "owner-001");
    mockedProcessChatMessage.mockResolvedValueOnce({
      status: 200,
      reply: "1号棚当前温度 25.3°C。",
      command_id: "cmd-test-001",
      execution_transport: "mqtt",
      lifecycle_state: "sent",
      params: { duration_seconds: 600 },
    });
    app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/integrations/chat",
      headers: { authorization: `Bearer ${TEST_SECRET}` },
      payload: { text: "1号棚现在多少度？", user_id: "wx_bound_owner", platform: "wechat" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.reply).toBe("1号棚当前温度 25.3°C。");
    expect(body.command_id).toBe("cmd-test-001");
    expect(body.execution_transport).toBe("mqtt");
    expect(body.lifecycle_state).toBe("sent");
    expect(body.params).toEqual({ duration_seconds: 600 });
    expect(mockedProcessChatMessage).toHaveBeenCalledOnce();
  });
});
