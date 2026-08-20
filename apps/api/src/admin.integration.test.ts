import { getPlatformRuntimeContext } from "./runtime/context.js";
import { allocateAgentDataDir, releaseAgentDataDir } from "./test/isolated-data-dir.js";
import { describe, expect, it, beforeAll, beforeEach, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import type { DeviceRegistry } from "@embodied-agent/core";

import { buildApp } from "./app.js";
import {
  applyCommandEvent,
  clearCommands,
  createCommand,
  markCommandSent,
} from "./commands/store.js";
import { LlmUnavailableError } from "@embodied-agent/agent";
import { saveSettings } from "./settings/store.js";
import { saveRegistry } from "@embodied-agent/node";
import { setAlertRule } from "./alerts/threshold-store.js";
import { seedCanonicalSimRegistry } from "./test/registry-fixture.js";
import { seedDefaultUsers } from "./test/users-fixture.js";
import { upsertBinding } from "./auth/platform-bind.js";
import { ingestHeartbeatMessage, resetTelemetryCacheForTests } from "./telemetry/store.js";
import { preloadDomainPacks } from "./domain-packs/loader.js";

let testDir: string;
let savedNodeEnv: string | undefined;

const unavailableLlm = {
  async completeJson() {
    throw new LlmUnavailableError("LLM_API_KEY is not set");
  },
  async completeText() {
    throw new LlmUnavailableError("LLM_API_KEY is not set");
  },
};

function robotRegistryFixture(): DeviceRegistry {
  return {
    deployments: [
      {
        deployment_id: "dep-robot-dogfood-001",
        name: "Robot Dogfood",
        timezone: "Asia/Shanghai",
        status: "active",
      },
    ],
    entities: [
      {
        deployment_id: "dep-robot-dogfood-001",
        domain_id: "robotics",
        entity_type: "robot",
        entity_id: "m20-001",
        name: "M20",
        aliases: [],
        status: "active",
      },
    ],
    nodes: [
      {
        node_id: "node-m20-001",
        deployment_id: "dep-robot-dogfood-001",
        entity_id: "m20-001",
        status: "active",
      },
    ],
    devices: [
      {
        device_id: "m20-001",
        deployment_id: "dep-robot-dogfood-001",
        entity_id: "m20-001",
        device_type: "robot_dog",
        name: "M20",
        aliases: [],
        node_id: "node-m20-001",
        status: "active",
        transport: "m20_http",
      },
    ],
  };
}

describe("admin & integration", () => {
  beforeAll(async () => {
    await preloadDomainPacks(getPlatformRuntimeContext().loader, { packIds: ["robotics"] });
  });

  beforeEach(() => {
    savedNodeEnv = process.env.NODE_ENV;
    testDir = allocateAgentDataDir("test");
    seedCanonicalSimRegistry();
    seedDefaultUsers();
    process.env.INTEGRATION_SECRET = "test-integration-secret";
    process.env.ADMIN_TOKEN = "test-admin-token";
    delete process.env.LLM_API_KEY;
    saveSettings({ deployment_id: "dep-gh-pilot-001", active_domain: "agriculture" });
  });
  afterEach(() => {
    delete process.env.INTEGRATION_SECRET;
    delete process.env.ADMIN_TOKEN;
    delete process.env.CORS_ORIGIN;
    delete process.env.LLM_API_KEY;
    if (savedNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNodeEnv;
    }
    delete process.env.DEPLOYMENT_ID;
    delete process.env.ACTIVE_DOMAIN;
    releaseAgentDataDir(testDir);
  });

  it("GET /admin/settings requires admin token", async () => {
    const app = await buildApp();
    const unauthorized = await app.inject({
      method: "GET",
      url: "/admin/settings",
    });
    expect(unauthorized.statusCode).toBe(401);

    const ok = await app.inject({
      method: "GET",
      url: "/admin/settings",
      headers: { "x-admin-token": "test-admin-token" },
    });
    expect(ok.statusCode).toBe(200);
    const body = ok.json() as { deployment_id: string; llm_api_key_set: boolean };
    expect(body.deployment_id).toBeDefined();
    await app.close();
  });

  it("PUT /admin/settings persists llm key without exposing it", async () => {
    const app = await buildApp();
    const put = await app.inject({
      method: "PUT",
      url: "/admin/settings",
      headers: { "x-admin-token": "test-admin-token" },
      payload: {
        deployment_name: "网关测试农场",
        llm_api_key: "sk-persisted-key",
        integration_secret: "test-integration-secret",
      },
    });
    expect(put.statusCode).toBe(200);
    const saved = put.json() as {
      settings: { deployment_name: string; llm_api_key_set: boolean };
    };
    expect(saved.settings.deployment_name).toBe("网关测试农场");
    expect(saved.settings.llm_api_key_set).toBe(true);

    const get = await app.inject({
      method: "GET",
      url: "/admin/settings",
      headers: { "x-admin-token": "test-admin-token" },
    });
    const pub = get.json() as { llm_api_key_masked?: string; llm_api_key_set: boolean };
    expect(pub.llm_api_key_set).toBe(true);
    expect(pub.llm_api_key_masked).toMatch(/key$/);
    await app.close();
  });

  it("PUT /admin/settings rejects inactive domain_configs", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "PUT",
      url: "/admin/settings",
      headers: { "x-admin-token": "test-admin-token" },
      payload: {
        domain_configs: {
          robotics: { m20_base_url: "http://127.0.0.1:3099" },
        },
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/active_domain/);
    await app.close();
  });

  it("PUT /admin/settings rejects deployment switch when active pack registry readiness fails", async () => {
    saveRegistry({
      deployments: [
        {
          deployment_id: "dep-gh-pilot-001",
          name: "Greenhouse Pilot",
          timezone: "Asia/Shanghai",
          status: "active",
        },
        {
          deployment_id: "dep-empty-001",
          name: "Empty Deployment",
          timezone: "Asia/Shanghai",
          status: "active",
        },
      ],
      entities: [],
      nodes: [],
      devices: [],
    });
    const app = await buildApp();
    const res = await app.inject({
      method: "PUT",
      url: "/admin/settings",
      headers: { "x-admin-token": "test-admin-token" },
      payload: {
        deployment_id: "dep-empty-001",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/配置\/registry 不满足 readiness/);
    await app.close();
  });

  it("rejects satellite admin routes when the active Domain Pack has no satellite capability", async () => {
    process.env.ACTIVE_DOMAIN = "robotics";
    saveSettings({
      deployment_id: "dep-gh-pilot-001",
      active_domain: "robotics",
      domain_configs: {
        robotics: {
          m20_base_url: "http://127.0.0.1:18080",
          default_robot_id: "m20-001",
        },
      },
    });
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/admin/satellite/ndvi",
      headers: { "x-admin-token": "test-admin-token" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/satellite 能力/);
    await app.close();
  });

  it("only registers admin extension routes for the active Domain Pack", async () => {
    const agricultureApp = await buildApp();
    const inactive = await agricultureApp.inject({
      method: "GET",
      url: "/admin/robot/config",
      headers: { "x-admin-token": "test-admin-token" },
    });
    expect(inactive.statusCode).toBe(404);
    await agricultureApp.close();

    saveRegistry(robotRegistryFixture());
    process.env.ACTIVE_DOMAIN = "robotics";
    saveSettings({
      deployment_id: "dep-robot-dogfood-001",
      active_domain: "robotics",
      domain_configs: {
        robotics: {
          m20_base_url: "http://127.0.0.1:18080",
          default_robot_id: "m20-001",
        },
      },
    });
    const roboticsApp = await buildApp();
    const active = await roboticsApp.inject({
      method: "GET",
      url: "/admin/robot/config",
      headers: { "x-admin-token": "test-admin-token" },
    });
    expect(active.statusCode).toBe(200);
    expect(active.json()).toMatchObject({
      active_domain: "robotics",
      default_robot_id: "m20-001",
    });
    await roboticsApp.close();
  });

  it("rejects dev-admin header in production when a real ADMIN_TOKEN is configured", async () => {
    delete process.env.INTEGRATION_SECRET;
    process.env.CORS_ORIGIN = "http://localhost:5173";
    process.env.NODE_ENV = "production";
    process.env.METRICS_ALLOW_PUBLIC = "1";
    process.env.ADMIN_TOKEN = "pilot-secret-token";
    const app = await buildApp();

    const res = await app.inject({
      method: "GET",
      url: "/admin/settings",
      headers: { "x-admin-token": "dev-admin" },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("allows explicit admin token in production", async () => {
    process.env.ADMIN_TOKEN = "explicit-admin-token";
    process.env.CORS_ORIGIN = "http://localhost:5173";
    process.env.NODE_ENV = "production";
    process.env.METRICS_ALLOW_PUBLIC = "1";
    process.env.DEPLOYMENT_ID = "dep-gh-pilot-001";
    process.env.ACTIVE_DOMAIN = "agriculture";
    const app = await buildApp();

    const ok = await app.inject({
      method: "GET",
      url: "/admin/settings",
      headers: { "x-admin-token": "explicit-admin-token" },
    });

    expect(ok.statusCode).toBe(200);
    await app.close();
  });

  it("POST /integrations/chat requires bearer secret", async () => {
    saveSettings({ integration_secret: "test-integration-secret" });
    const app = await buildApp({
      pipeline: {
        llmClient: unavailableLlm,
        model: "unavailable",
        mqttEnabled: false,
      },
    });

    const bad = await app.inject({
      method: "POST",
      url: "/integrations/chat",
      payload: { text: "1号棚现在多少度？" },
    });
    expect(bad.statusCode).toBe(401);
    await app.close();
  });

  it("POST /integrations/chat fails closed without secret when NODE_ENV is unset", async () => {
    delete process.env.INTEGRATION_SECRET;
    delete process.env.NODE_ENV;
    const app = await buildApp({
      pipeline: {
        llmClient: unavailableLlm,
        model: "unavailable",
        mqttEnabled: false,
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/integrations/chat",
      payload: { text: "1号棚现在多少度？", user_id: "wx_owner_bound", platform: "wechat" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("rejects unbound platform user with friendly reply", async () => {
    saveSettings({ integration_secret: "test-integration-secret" });
    const app = await buildApp({
      pipeline: {
        llmClient: unavailableLlm,
        model: "unavailable",
        mqttEnabled: false,
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/integrations/chat",
      headers: { authorization: "Bearer test-integration-secret" },
      payload: {
        text: "1号棚现在多少度？",
        user_id: "wx_not_bound_999",
        platform: "wechat",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      reply: expect.stringMatching(/尚未绑定/),
    });
    await app.close();
  });

  it("returns friendly reply when STT not configured for audio", async () => {
    saveSettings({
      integration_secret: "test-integration-secret",
      stt_provider: "none",
    });
    upsertBinding("wechat", "wx_owner_bound", "owner-001");
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/integrations/chat",
      headers: { authorization: "Bearer test-integration-secret" },
      payload: {
        audio_base64: Buffer.from("x").toString("base64"),
        user_id: "wx_owner_bound",
        platform: "wechat",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      reply: expect.stringMatching(/没听清/),
    });
    await app.close();
  });

  it("requires explicit integration platform", async () => {
    saveSettings({ integration_secret: "test-integration-secret" });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/integrations/chat",
      headers: { authorization: "Bearer test-integration-secret" },
      payload: {
        text: "1号棚现在多少度？",
        user_id: "wx_owner_bound",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      reply: "body must have required property 'platform'",
    });
    await app.close();
  });

  it("GET /admin/overview returns entities and services", async () => {
    const app = await buildApp();
    const unauthorized = await app.inject({
      method: "GET",
      url: "/admin/overview",
    });
    expect(unauthorized.statusCode).toBe(401);

    const res = await app.inject({
      method: "GET",
      url: "/admin/overview",
      headers: { "x-admin-token": "test-admin-token" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      entities: unknown[];
      services: { api: string };
      pending_confirms_count: number;
      pending_confirms: unknown[];
    };
    expect(Array.isArray(body.entities)).toBe(true);
    expect(body.services.api).toBe("ok");
    expect(typeof body.pending_confirms_count).toBe("number");
    expect(Array.isArray(body.pending_confirms)).toBe(true);
    await app.close();
  });

  it("GET /admin/overview with operator web session returns pending_confirms array", async () => {
    const app = await buildApp();
    const created = await app.inject({
      method: "POST",
      url: "/auth/dev/create-user",
      payload: {
        email: "ops-overview@example.com",
        password: "ops-overview-1",
        role: "user",
      },
    });
    expect(created.statusCode).toBe(200);

    const login = await app.inject({
      method: "POST",
      url: "/auth/email",
      payload: { email: "ops-overview@example.com", password: "ops-overview-1" },
    });
    expect(login.statusCode).toBe(200);
    const setCookie = login.headers["set-cookie"];
    const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const cookie = raw?.split(";")[0] ?? "";

    const res = await app.inject({
      method: "GET",
      url: "/admin/overview",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { pending_confirms: unknown[] };
    expect(Array.isArray(body.pending_confirms)).toBe(true);
    await app.close();
  });

  it("GET /admin/domain-packs returns readiness evidence", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/admin/domain-packs",
      headers: { "x-admin-token": "test-admin-token" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      catalog: {
        id: string;
        capabilities?: { digest?: boolean; satellite?: boolean };
        ops_schema?: {
          schema_version: 1;
          pack_id: string;
          navigation: { tabs: { id: string; enabled: boolean }[] };
          settings: { fields: { id: string; control: string; save_target: string }[] };
          devices: { binding: { physical_skills: string[] } };
          control: { actions: { skill: string; physical: boolean }[] };
          eval_evidence: { slices: { id: string; path: string }[] };
        };
        readiness?: {
          deliverable: boolean;
          readiness: string;
          eval: { matrix_negative_rows: number };
        };
      }[];
      active_ops_schema?: {
        schema_version: 1;
        pack_id: string;
        navigation: { tabs: { id: string; enabled: boolean }[] };
        control: { actions: { skill: string }[] };
      } | null;
      active_error?: string | null;
    };
    const agriculture = body.catalog.find((pack) => pack.id === "agriculture");
    const aquaculture = body.catalog.find((pack) => pack.id === "aquaculture");
    const agricultureReadiness = agriculture?.readiness;
    expect(agricultureReadiness).toBeDefined();
    if (!agricultureReadiness) throw new Error("missing agriculture readiness");
    expect(agricultureReadiness.deliverable).toBe(true);
    expect(agriculture?.capabilities?.digest).toBe(true);
    expect(agriculture?.capabilities?.satellite).toBe(true);
    expect(body.active_error).toBeNull();
    expect(body.active_ops_schema?.schema_version).toBe(1);
    expect(body.active_ops_schema?.pack_id).toBe("agriculture");
    expect(body.active_ops_schema?.control.actions.length).toBeGreaterThan(0);
    expect(agriculture?.ops_schema?.schema_version).toBe(1);
    expect(agriculture?.ops_schema?.navigation.tabs.map((tab) => tab.id)).toEqual(
      expect.arrayContaining(["overview", "settings", "devices", "users", "review", "platform"]),
    );
    expect(agriculture?.ops_schema?.settings.fields.map((field) => field.id)).toEqual(
      expect.arrayContaining(["deployment_id", "active_domain", "llm_api_key", "mqtt_url"]),
    );
    expect(agriculture?.ops_schema?.devices.binding.physical_skills.length).toBeGreaterThan(0);
    expect(agriculture?.ops_schema?.control.actions[0]?.physical).toBe(true);
    expect(agriculture?.ops_schema?.eval_evidence.slices.map((slice) => slice.id)).toEqual([
      "golden",
      "matrix_extra",
      "matrix_wechat",
      "matrix_negative",
    ]);
    expect(agricultureReadiness.eval.matrix_negative_rows).toBeGreaterThan(0);
    expect(aquaculture?.readiness).toBeUndefined();
    expect(aquaculture?.capabilities).toBeUndefined();
    expect(aquaculture?.ops_schema).toBeUndefined();
    await app.close();
  });

  it("GET /domain-packs returns public runtime catalog without readiness evidence", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/domain-packs",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      deployment_id: string;
      active_domain: string;
      catalog: {
        id: string;
        display_name: string;
        status: string;
        active: boolean;
        capabilities?: { digest?: boolean; satellite?: boolean };
        readiness?: unknown;
      }[];
    };
    expect(body.deployment_id).toBe("dep-gh-pilot-001");
    expect(body.active_domain).toBe("agriculture");
    expect(body.catalog.find((pack) => pack.id === "agriculture")).toMatchObject({
      status: "live",
      active: true,
      capabilities: expect.objectContaining({ digest: true, satellite: true }),
    });
    expect(body.catalog.find((pack) => pack.id === "agriculture")?.readiness).toBeUndefined();
    await app.close();
  });

  it("GET /admin/platform/readiness reports platform checks", async () => {
    saveSettings({ llm_api_key: "sk-readiness-check" });
    const app = await buildApp();
    const unauthorized = await app.inject({
      method: "GET",
      url: "/admin/platform/readiness",
    });
    expect(unauthorized.statusCode).toBe(401);

    const res = await app.inject({
      method: "GET",
      url: "/admin/platform/readiness",
      headers: { "x-admin-token": "test-admin-token" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      active_domain: string;
      packs: { pack_id: string; deliverable: boolean }[];
      checks: { id: string; ok: boolean }[];
    };
    expect(body.active_domain).toBe("agriculture");
    expect(body.packs.find((pack) => pack.pack_id === "agriculture")?.deliverable).toBe(true);
    expect(body.checks.find((check) => check.id === "llm")?.ok).toBe(true);
    await app.close();
  });

  it("GET /admin/status reports llm_configured from settings file", async () => {
    saveSettings({ llm_api_key: "sk-status-check" });
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/admin/status",
      headers: { "x-admin-token": "test-admin-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      llm_configured: true,
      api: "ok",
    });
    await app.close();
  });

  it("GET /admin/commands requires admin token", async () => {
    const app = await buildApp();
    const unauthorized = await app.inject({
      method: "GET",
      url: "/admin/commands/cmd-test-1",
    });
    expect(unauthorized.statusCode).toBe(401);
    await app.close();
  });

  it("GET /admin/commands/:command_id returns 404 for unknown id", async () => {
    clearCommands();
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/admin/commands/cmd-does-not-exist",
      headers: { "x-admin-token": "test-admin-token" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "command_not_found" });
    await app.close();
  });

  it("GET /admin/commands/:command_id returns lifecycle status", async () => {
    clearCommands();
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 60_000).toISOString();
    const command = {
      message_type: "command" as const,
      protocol_version: "0.1" as const,
      command_id: "cmd-integration-test-1",
      idempotency_key: "dep-gh-pilot-001:owner-001:greenhouse.open_vent:vent-sim-gh-001:test",
      deployment_id: "dep-gh-pilot-001",
      node_id: "node-sim-gh-001",
      device_id: "vent-sim-gh-001",
      device_type: "vent_motor" as const,
      action: "open" as const,
      parameters: { duration_seconds: 600 },
      issued_by: {
        user_id: "owner-001",
        role: "owner",
        platform: "dev",
        conversation_id: "dev-001",
      },
      created_at: now,
      expires_at: expires,
    };
    createCommand(command);
    markCommandSent(command.command_id);

    const app = await buildApp();
    const sent = await app.inject({
      method: "GET",
      url: `/admin/commands/${command.command_id}`,
      headers: { "x-admin-token": "test-admin-token" },
    });
    expect(sent.statusCode).toBe(200);
    expect(sent.json()).toMatchObject({
      command_id: command.command_id,
      status: "sent",
      command: { action: "open", device_id: "vent-sim-gh-001" },
    });

    applyCommandEvent({
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: "evt-integration-test-1",
      command_id: command.command_id,
      idempotency_key: command.idempotency_key,
      deployment_id: command.deployment_id,
      node_id: command.node_id,
      device_id: command.device_id,
      status: "running",
      occurred_at: new Date().toISOString(),
    });

    const running = await app.inject({
      method: "GET",
      url: `/admin/commands/${command.command_id}`,
      headers: { "x-admin-token": "test-admin-token" },
    });
    expect(running.statusCode).toBe(200);
    expect(running.json()).toMatchObject({
      command_id: command.command_id,
      status: "running",
    });
    await app.close();
  });

  it("GET /admin/commands lists recent commands", async () => {
    clearCommands();
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 60_000).toISOString();
    const base = {
      message_type: "command" as const,
      protocol_version: "0.1" as const,
      idempotency_key: "test-key",
      deployment_id: "dep-gh-pilot-001",
      node_id: "node-sim-gh-001",
      device_id: "vent-sim-gh-001",
      device_type: "vent_motor" as const,
      action: "open" as const,
      parameters: { duration_seconds: 60 },
      issued_by: {
        user_id: "owner-001",
        role: "owner",
        platform: "dev",
        conversation_id: "dev-001",
      },
      created_at: now,
      expires_at: expires,
    };
    createCommand({ ...base, command_id: "cmd-list-a" });
    createCommand({ ...base, command_id: "cmd-list-b", idempotency_key: "test-key-b" });

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/admin/commands?limit=10",
      headers: { "x-admin-token": "test-admin-token" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { count: number; commands: { command_id: string }[] };
    expect(body.count).toBe(2);
    expect(body.commands.map((c) => c.command_id).sort()).toEqual(["cmd-list-a", "cmd-list-b"]);
    await app.close();
  });

  it("PUT /admin/settings persists notification and NLG toggles", async () => {
    const app = await buildApp();
    const put = await app.inject({
      method: "PUT",
      url: "/admin/settings",
      headers: { "x-admin-token": "test-admin-token" },
      payload: {
        nlg_enabled: false,
        alert_push_enabled: false,
        digest_enabled: false,
        weather_proactive_enabled: false,
      },
    });
    expect(put.statusCode).toBe(200);
    const saved = put.json() as {
      settings: {
        nlg_enabled: boolean;
        alert_push_enabled: boolean;
        digest_enabled: boolean;
        weather_proactive_enabled: boolean;
      };
    };
    expect(saved.settings.nlg_enabled).toBe(false);
    expect(saved.settings.alert_push_enabled).toBe(false);
    expect(saved.settings.digest_enabled).toBe(false);
    expect(saved.settings.weather_proactive_enabled).toBe(false);

    const get = await app.inject({
      method: "GET",
      url: "/admin/settings",
      headers: { "x-admin-token": "test-admin-token" },
    });
    expect(get.json()).toMatchObject({
      nlg_enabled: false,
      alert_push_enabled: false,
      digest_enabled: false,
      weather_proactive_enabled: false,
    });
    await app.close();
  });

  it("GET/POST/PUT/DELETE /admin/users CRUD", async () => {
    const app = await buildApp();
    const headers = { "x-admin-token": "test-admin-token" };

    const list0 = await app.inject({
      method: "GET",
      url: "/admin/users",
      headers,
    });
    expect(list0.statusCode).toBe(200);
    const initial = (list0.json() as { users: { user_id: string }[] }).users;
    expect(initial.some((u) => u.user_id === "owner-001")).toBe(true);

    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload: {
        user_id: "operator-test-001",
        role: "operator",
        deployment_id: "dep-gh-pilot-001",
        display_name: "测试操作员",
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      ok: true,
      user: { user_id: "operator-test-001", role: "operator" },
    });

    const updated = await app.inject({
      method: "PUT",
      url: "/admin/users/operator-test-001",
      headers,
      payload: { display_name: "已改名" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      user: { display_name: "已改名" },
    });

    const deleted = await app.inject({
      method: "DELETE",
      url: "/admin/users/operator-test-001",
      headers,
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({ ok: true });

    const list1 = await app.inject({
      method: "GET",
      url: "/admin/users",
      headers,
    });
    const users = (list1.json() as { users: { user_id: string }[] }).users;
    expect(users.some((u) => u.user_id === "operator-test-001")).toBe(false);
    await app.close();
  });

  it("GET /admin/alert-rules validates deployment_id query", async () => {
    setAlertRule({
      entity_id: "gh-001",
      metric: "temperature_c",
      operator: ">",
      value: 28,
      updated_by: "owner-001",
    });
    const app = await buildApp();
    const headers = { "x-admin-token": "test-admin-token" };

    const ok = await app.inject({
      method: "GET",
      url: "/admin/alert-rules?deployment_id=dep-gh-pilot-001",
      headers,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      deployment_id: "dep-gh-pilot-001",
      count: 1,
    });

    const mismatch = await app.inject({
      method: "GET",
      url: "/admin/alert-rules?deployment_id=farm-999",
      headers,
    });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json()).toMatchObject({ error: "deployment_mismatch" });

    const invalid = await app.inject({
      method: "GET",
      url: "/admin/alert-rules?deployment_id=../escape",
      headers,
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: "invalid_deployment_id" });
    await app.close();
  });

  it("returns explicit registry errors without breaking current deployment operation routes", async () => {
    rmSync(resolve(testDir, "device-registry.json"), { force: true });
    const app = await buildApp();
    const headers = { "x-admin-token": "test-admin-token" };

    const deployments = await app.inject({
      method: "GET",
      url: "/admin/deployments",
      headers,
    });
    expect(deployments.statusCode).toBe(500);
    expect(deployments.json()).toMatchObject({ error: "registry_unavailable" });

    const sceneAll = await app.inject({
      method: "GET",
      url: "/admin/scene-outcomes/all",
      headers,
    });
    expect(sceneAll.statusCode).toBe(200);
    expect(sceneAll.json()).toMatchObject({
      deployments: { "dep-gh-pilot-001": { total: 0, success_count: 0 } },
      total: 0,
      success_count: 0,
    });

    const alertRules = await app.inject({
      method: "GET",
      url: "/admin/alert-rules?deployment_id=dep-gh-pilot-001",
      headers,
    });
    expect(alertRules.statusCode).toBe(200);
    expect(alertRules.json()).toMatchObject({
      deployment_id: "dep-gh-pilot-001",
      count: 0,
    });
    await app.close();
  });

  it("GET /admin/scene-outcomes and pilot baseline", async () => {
    const app = await buildApp();
    const headers = { "x-admin-token": "test-admin-token" };

    const empty = await app.inject({
      method: "GET",
      url: "/admin/scene-outcomes",
      headers,
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toMatchObject({
      deployment_id: "dep-gh-pilot-001",
      outcomes: [],
    });

    const baselineGet = await app.inject({
      method: "GET",
      url: "/admin/pilot/baseline",
      headers,
    });
    expect(baselineGet.statusCode).toBe(200);
    expect(baselineGet.json()).toMatchObject({
      deployment_id: "dep-gh-pilot-001",
      baseline: null,
    });

    const baselinePost = await app.inject({
      method: "POST",
      url: "/admin/pilot/baseline",
      headers,
      payload: { manual_run_shed_count_per_week: 4, notes: "pilot week 1" },
    });
    expect(baselinePost.statusCode).toBe(200);
    expect(baselinePost.json()).toMatchObject({
      ok: true,
      baseline: { manual_run_shed_count_per_week: 4 },
    });
    await app.close();
  });

  it("GET /admin/nodes includes runtime online from heartbeat", async () => {
    resetTelemetryCacheForTests();
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001" });
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/admin/nodes?status=active",
      headers: { "x-admin-token": "test-admin-token" },
    });
    expect(res.statusCode).toBe(200);
    const nodes = res.json().nodes as Array<{
      node_id: string;
      online: boolean;
      reported_at: string | null;
    }>;
    const gh001 = nodes.find((n) => n.node_id === "node-sim-gh-001");
    const gh002 = nodes.find((n) => n.node_id === "node-sim-gh-002");
    expect(gh001?.online).toBe(true);
    expect(gh001?.reported_at).toBeTruthy();
    expect(gh002?.online).toBe(false);
    await app.close();
  });

  it("GET /admin/status reports llm_configured false when no llm key exists", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/admin/status",
      headers: { "x-admin-token": "test-admin-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      llm_configured: false,
      api: "ok",
    });
    await app.close();
  });
});
